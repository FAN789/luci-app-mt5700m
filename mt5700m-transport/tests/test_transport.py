"""Exercise the real C transport against a scripted TCP modem and PTY."""
import os
import pathlib
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import pty
import select

BIN = os.environ['TRANSPORT_BIN']


class TransportTests(unittest.TestCase):
    def run_modem(self, script, args, code=0, timeout=2):
        errors = []
        server = socket.socket()
        server.bind(('127.0.0.1', 0))
        server.listen()
        server.settimeout(4)
        def serve():
            try:
                conn, _ = server.accept()
                with conn:
                    conn.settimeout(4)
                    stream = conn.makefile('rb', buffering=0)
                    for expected, response in script:
                        got = bytearray()
                        terminator = b'\r'
                        while not got.endswith(terminator):
                            b = stream.read(1)
                            if not b: break
                            got.extend(b)
                        if isinstance(expected, tuple) and expected[0] == 'SMS':
                            header, encoded = bytes(got[:-1]).split(b'\\r')
                            self.assertEqual(header, b'AT+CMGS=' + str(expected[1]).encode())
                            payload = bytes.fromhex(encoded.decode())
                            self.assertEqual(payload[0], 0)
                            self.assertEqual(len(payload)-1, expected[1])
                            self.assertNotIn(b'\x1a', got)
                            if len(expected)>2: self.assertTrue(payload.endswith(expected[2]))
                        else:
                            self.assertEqual(got, expected + b'\r')
                        if response is None:
                            time.sleep(timeout + .3)
                        else:
                            for fragment in response:
                                if isinstance(fragment, tuple):
                                    time.sleep(fragment[0])
                                    fragment = fragment[1]
                                conn.sendall(fragment)
                                time.sleep(.005)
            except Exception as exc:
                errors.append(exc)
            finally:
                server.close()
        thread = threading.Thread(target=serve)
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, MT5700M_TRANSPORT_LOCK=tmp+'/lock')
            thread.start()
            result = subprocess.run([BIN, '-h', '127.0.0.1', '-p', str(server.getsockname()[1]),
                                     '-t', str(timeout)] + args, env=env, capture_output=True, timeout=12)
            thread.join(5)
        if errors: raise errors[0]
        self.assertEqual(result.returncode, code, result.stderr)
        return result

    def test_fragmented_success(self):
        r = self.run_modem([(b'AT+CSQ', [b'AT+CSQ\r\n+CSQ: 20,99\r\n', b'O', b'K\r\n'])], ['at', 'AT+CSQ'])
        self.assertIn(b'+CSQ: 20,99', r.stdout)

    def test_modem_error(self):
        self.run_modem([(b'AT+BAD', [b'\r\n+CME ERROR: 50\r\n'])], ['at', 'AT+BAD'], 65)

    def test_payload_error_word_is_not_terminal(self):
        self.run_modem([(b'AT+CMGL=4', [b'\r\n+DATA: ERROR statistics\r\nOK\r\n'])], ['at', 'AT+CMGL=4'])

    def test_timeout(self):
        self.run_modem([(b'AT+CFUN=1', None)], ['at', 'AT+CFUN=1'], 124, 1)

    def test_disconnect(self):
        self.run_modem([(b'AT', [])], ['at', 'AT'], 74)

    def test_sms_chinese(self):
        self.run_modem([(b'AT+CMGF=0', [b'\r\nOK\r\n']),
                        (('SMS',18,'你好'.encode('utf-16-be')), [b'\r\n+CMGS: 12\r\n', b'OK\r\n'])],
                       ['sms', '+8613800138000', '你好'])

    def test_sms_requires_cmgs(self):
        self.run_modem([(b'AT+CMGF=0', [b'\r\nOK\r\n']),
                        (('SMS',18), [b'\r\nOK\r\n'])], ['sms', '+8613800138000', '你好'], 65)

    def test_mt5700m_echo_is_not_confirmation(self):
        self.run_modem([(b'AT+CMGF=0', [b'\r\nOK\r\n']),
                        (('SMS',18), [b'\r\nAT+CMGS=18', b'\x1a\r\nOK\r\n'])],
                       ['sms', '+8613800138000', '你好'],65)

    def test_ordinary_echo_is_not_input_marker(self):
        r = self.run_modem([(b'AT+CMGF=0', [b'\r\nOK\r\n']),
                            (('SMS',18), [b'\r\nAT+CMGS=18\r\n'])],
                           ['sms', '+8613800138000', '你好'], 74)
        self.assertIn(b'phase=submit-confirmation', r.stderr)
        self.assertIn(b'do not automatically resend', r.stderr)

    def test_confirmation_can_exceed_query_timeout(self):
        self.run_modem([(b'AT+CMGF=0', [b'\r\nOK\r\n']),
                        (('SMS',18), [(2, b'\r\n+CMGS: 12\r\nOK\r\n')])],
                       ['sms', '+8613800138000', '你好'], timeout=1)

    def test_sms_numeric_error_without_private_echo(self):
        r=self.run_modem([(b'AT+CMGF=0', [b'\r\nOK\r\n']),
                        (('SMS',18), [b'\r\nPRIVATE PDU ECHO\r\n+CMS ERROR: 500\r\n'])],
                       ['sms', '+8613800138000', '你好'], 65)
        self.assertIn(b'Modem SMS error=500',r.stderr)
        self.assertNotIn(b'PRIVATE',r.stderr+r.stdout)

    def test_false_cmgs_in_echo_is_not_success(self):
        self.run_modem([(b'AT+CMGF=0',[b'\r\nOK\r\n']),
                        (('SMS',18),[b'\r\nECHO +CMGS: 1\r\nOK\r\n'])],
                       ['sms','+8613800138000','你好'],65)

    def test_multipart(self):
        self.run_modem([(b'AT+CMGF=0', [b'\r\nOK\r\n']),
                        (('SMS',154), [b'\r\n+CMGS: 1\r\nOK\r\n']),
                        (('SMS',28), [b'\r\n+CMGS: 2\r\nOK\r\n'])],
                       ['sms', '+8613800138000', '好'*71])

    def test_multipart_stops_after_error_without_retry(self):
        r=self.run_modem([(b'AT+CMGF=0',[b'\r\nOK\r\n']),
                         (('SMS',154),[b'\r\n+CMGS: 1\r\nOK\r\n']),
                         (('SMS',28),[b'\r\n+CMS ERROR: 500\r\n'])],
                        ['sms','+8613800138000','好'*71],65)
        self.assertIn(b'part=2/2 confirmed=1',r.stderr)

    def test_invalid_inputs_before_connect(self):
        for args in [['at', 'AT\rAT&F'], ['sms', '+12+34', 'a'],
                     ['sms', '123', ''], ['sms', '123', '中'*671]]:
            p = subprocess.run([BIN, '-h', '127.0.0.1', '-p', '1']+args, capture_output=True)
            self.assertEqual(p.returncode, 64)

    def test_serial_pty(self):
        master, slave = pty.openpty()
        with tempfile.TemporaryDirectory() as tmp:
            p = subprocess.Popen([BIN, '-d', os.ttyname(slave), '-t', '2', 'at', 'AT'],
                                 env=dict(os.environ, MT5700M_TRANSPORT_LOCK=tmp+'/lock'),
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertTrue(select.select([master], [], [], 3)[0])
            self.assertEqual(os.read(master, 100), b'AT+CMEE?\r')
            os.write(master, b'\r\nOK\r\nERROR\r\n')
            self.assertFalse(select.select([master], [], [], .1)[0])
            os.write(master, b'\r\n+CMEE: 1\r\nOK\r\n')
            self.assertTrue(select.select([master], [], [], 3)[0])
            self.assertEqual(os.read(master, 100), b'AT\r')
            os.write(master, b'\r\nOK\r\n')
            out, err = p.communicate(timeout=3)
            self.assertEqual(p.returncode, 0, err)
            self.assertIn(b'OK', out)
        os.close(master); os.close(slave)

    def test_emoji_single_and_pair_boundary(self):
        self.run_modem([(b'AT+CMGF=0',[b'\r\nOK\r\n']),
                        (('SMS',18,'😀'.encode('utf-16-be')),[b'\r\n+CMGS: 1\r\nOK\r\n'])],
                       ['sms','+8613800138000','😀'])
        # 66 BMP code units followed by a surrogate pair must not split the pair.
        self.run_modem([(b'AT+CMGF=0',[b'\r\nOK\r\n']),
                        (('SMS',152,('好'*66).encode('utf-16-be')),[b'\r\n+CMGS: 1\r\nOK\r\n']),
                        (('SMS',32,('😀'+'好'*4).encode('utf-16-be')),[b'\r\n+CMGS: 2\r\nOK\r\n'])],
                       ['sms','+8613800138000','好'*66+'😀'+'好'*4])

    def test_serial_fence_rejects_bare_ok_and_marks_quarantine(self):
        master,slave=pty.openpty()
        with tempfile.TemporaryDirectory() as tmp:
            p=subprocess.Popen([BIN,'-d',os.ttyname(slave),'-t','1','at','AT+CFUN?'],
                env=dict(os.environ,MT5700M_TRANSPORT_LOCK=tmp+'/lock'),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            self.assertTrue(select.select([master],[],[],3)[0])
            self.assertEqual(os.read(master,100),b'AT+CMEE?\r')
            os.write(master,b'\r\nOK\r\n')
            out,err=p.communicate(timeout=3)
            self.assertEqual(p.returncode,124)
            self.assertIn(b'requested operation not issued',err)
            self.assertEqual(os.stat(tmp+'/lock').st_size,7)
        os.close(master); os.close(slave)

    def test_lock_timeout(self):
        import fcntl
        with tempfile.TemporaryDirectory() as tmp:
            with open(tmp+'/lock', 'w') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                p = subprocess.run([BIN, '-h', '127.0.0.1', '-t', '1', 'at', 'AT'],
                                   env=dict(os.environ, MT5700M_TRANSPORT_LOCK=tmp+'/lock'),
                                   capture_output=True, timeout=3)
                self.assertEqual(p.returncode, 75)

if __name__ == '__main__': unittest.main()
