/* SPDX-License-Identifier: Apache-2.0
 * MT5700M transport. No QModem code or libraries. Serial/TCP transactions
 * share one advisory lock; callers never retry an ambiguous write.
 */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/random.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>

#define CAP (1024 * 1024)
static char response[CAP];
static int fd = -1, timeout_ms = 8000;
static int synchronizing;
static long long now(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return (long long)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}
static int ready(int f, short events, long long end) {
    struct pollfd p = {f, events, 0};
    for (;;) {
        long long left = end - now();
        if (left <= 0) return 124;
        int n = poll(&p, 1, (int)left);
        if (n < 0 && errno == EINTR) continue;
        if (n == 0) return 124;
        if (n < 0 || (p.revents & (POLLERR | POLLNVAL))) return 74;
        if (p.revents & events) return 0;
        if (p.revents & POLLHUP) return 74;
    }
}
static int send_bytes(const void *buf, size_t len, long long end) {
    const char *p = buf;
    while (len) {
        int r = ready(fd, POLLOUT, end); if (r) return r;
        ssize_t n = write(fd, p, len);
        if (n < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (n <= 0) return 74;
        p += n; len -= (size_t)n;
    }
    return 0;
}
static int line_result(const char *s, size_t n) {
    if (n == 2 && !memcmp(s, "OK", 2)) return 1;
    if ((n == 5 && !memcmp(s, "ERROR", 5)) ||
        (n >= 10 && !memcmp(s, "+CME ERROR", 10)) ||
        (n >= 10 && !memcmp(s, "+CMS ERROR", 10)) ||
        (n == 10 && !memcmp(s, "NO CARRIER", 10))) return -1;
    return 0;
}
static int receive_result(long long end) {
    size_t used = 0, start = 0;
    int marker_seen=0;
    response[0] = 0;
    for (;;) {
        int r = ready(fd, POLLIN, end); if (r) return r;
        ssize_t n = read(fd, response + used, CAP - 1 - used);
        if (n < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (n <= 0) return 74;
        size_t old = used; used += (size_t)n; response[used] = 0;
        for (size_t i = old; i < used; i++) {
            if (response[i] == '\r' || response[i] == '\n') {
                size_t line_len=i-start;
                if(synchronizing && line_len>=8 && !memcmp(response+start,"+CMEE:",6)) {
                    size_t k=start+6; while(k<i && response[k]==' ') k++;
                    if(k+1==i && response[k]>='0' && response[k]<='2') marker_seen=1;
                }
                int result = line_result(response + start, i - start);
                if(synchronizing && !marker_seen) result=0;
                if (result < 0) return 65;
                if (result > 0) return 0;
                start = i + 1;
            }
        }
        if (used == CAP - 1) return 75;
    }
}
static int command(const char *s, int receive_timeout_ms) {
    long long end = now() + timeout_ms;
    char frame[4098];
    size_t len = strlen(s);
    if (len > sizeof(frame) - 2) return 64;
    memcpy(frame, s, len); frame[len++] = '\r';
    int r = send_bytes(frame, len, end);
    if (!r) r = receive_result(now() + (receive_timeout_ms ? receive_timeout_ms : timeout_ms));
    return r;
}
static int synchronize_modem(void) {
    /* A query-specific marker followed by OK is required. A bare delayed OK
     * or ERROR from a previous request cannot release this fence. */
    synchronizing=1;
    int r=command("AT+CMEE?",0);
    synchronizing=0;
    response[0]=0;
    if(r) fprintf(stderr,"Serial synchronization failed; requested operation not issued\n");
    return r;
}
static int lock_modem(void) {
    const char *path = getenv("MT5700M_TRANSPORT_LOCK");
    if (!path) path = "/var/lock/mt5700m-transport.lock";
    int f = open(path, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (f < 0) return -1;
    struct stat st;
    if (fstat(f, &st) || !S_ISREG(st.st_mode) || st.st_uid != geteuid() || st.st_nlink != 1) {
        close(f); return -1;
    }
    long long end = now() + timeout_ms;
    while (flock(f, LOCK_EX | LOCK_NB)) {
        if (errno != EWOULDBLOCK || now() >= end) { close(f); return -1; }
        usleep(20000);
    }
    return f;
}
static int connect_modem(const char *device, const char *host, int port) {
    if (device) {
        fd = open(device, O_RDWR | O_NOCTTY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW);
        if (fd < 0) return 69;
        struct termios t;
        if (tcgetattr(fd, &t)) return 69;
        cfmakeraw(&t); cfsetispeed(&t, B115200); cfsetospeed(&t, B115200);
        t.c_cflag |= CLOCAL | CREAD; t.c_cflag &= ~CRTSCTS;
        t.c_cc[VMIN] = 1; t.c_cc[VTIME] = 0;
        if (tcsetattr(fd, TCSANOW, &t) || tcflush(fd, TCIFLUSH)) return 69;
        return synchronize_modem();
    }
    struct sockaddr_in a = {.sin_family = AF_INET, .sin_port = htons((uint16_t)port)};
    /* Numeric IPv4 only: no DNS hangs and no implicit remote fallback. */
    if (!host || inet_pton(AF_INET, host, &a.sin_addr) != 1) return 64;
    fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    if (fd < 0) return 69;
    if (connect(fd, (struct sockaddr *)&a, sizeof(a)) && errno != EINPROGRESS) return 69;
    int r = ready(fd, POLLOUT, now() + timeout_ms);
    int e = 0; socklen_t len = sizeof(e);
    if (r || getsockopt(fd, SOL_SOCKET, SO_ERROR, &e, &len) || e) return 69;
    return 0;
}
/* UTF-8 to UTF-16BE code units. Surrogate pairs are kept in the same part. */
static int ucs2(const unsigned char *p, uint16_t *out, size_t *count) {
    size_t n = 0;
    while (*p) {
        uint32_t cp; int extra;
        if (*p < 0x80) { cp = *p++; extra = 0; }
        else if (*p >= 0xc2 && *p <= 0xdf) { cp = *p++ & 31; extra = 1; }
        else if (*p >= 0xe0 && *p <= 0xef) { cp = *p++ & 15; extra = 2; }
        else if (*p >= 0xf0 && *p <= 0xf4) { cp = *p++ & 7; extra = 3; }
        else return 64;
        for (int i = 0; i < extra; i++) {
            if ((*p & 0xc0) != 0x80) return 64;
            cp = (cp << 6) | (*p++ & 63);
        }
        if ((extra == 1 && cp < 128) || (extra == 2 && cp < 2048) ||
            (extra == 3 && cp < 65536) || cp>0x10ffff ||
            (cp >= 0xd800 && cp <= 0xdfff) || n+(cp>65535?2:1)>670) return 64;
        if(cp>65535) { cp-=65536; out[n++]=(uint16_t)(0xd800+(cp>>10)); out[n++]=(uint16_t)(0xdc00+(cp&1023)); }
        else out[n++] = (uint16_t)cp;
    }
    *count = n; return n ? 0 : 64;
}
static int valid_number(const char *p) {
    if (*p == '+') p++;
    size_t n = strlen(p);
    if (!n || n > 20) return 0;
    return strspn(p, "0123456789") == n;
}
static size_t pdu(unsigned char *b, const char *number, const uint16_t *text,
                  size_t count, int total, int part, unsigned char ref) {
    size_t n = 0;
    int international = *number == '+'; if (international) number++;
    size_t digits = strlen(number);
    b[n++] = 0; b[n++] = total > 1 ? 0x41 : 0x01; b[n++] = 0;
    b[n++] = (unsigned char)digits; b[n++] = international ? 0x91 : 0x81;
    for (size_t i = 0; i < digits; i += 2)
        b[n++] = (unsigned char)((number[i] - '0') | ((i + 1 < digits ? number[i+1] - '0' : 15) << 4));
    b[n++] = 0; b[n++] = 8;
    b[n++] = (unsigned char)(count * 2 + (total > 1 ? 6 : 0));
    if (total > 1) {
        b[n++] = 5; b[n++] = 0; b[n++] = 3; b[n++] = ref;
        b[n++] = (unsigned char)total; b[n++] = (unsigned char)part;
    }
    for (size_t i = 0; i < count; i++) { b[n++] = text[i] >> 8; b[n++] = text[i] & 255; }
    return n;
}
/* MT5700M AT manual 01, 2024-05-17, section 9.14.5: literal backslash-r
 * separates header and PDU inside ONE AT command. Do not interpret the echoed
 * command plus SUB as a standard interactive prompt. No Ctrl-Z write follows.
 * Also used by the separate, store-only hardware diagnostic (CMGW). */
static int sms_frame(char *out, size_t capacity, const unsigned char *bytes, size_t n) {
    int header = snprintf(out, capacity, "AT+CMGS=%zu\\r", n-1);
    if (header < 0 || (size_t)header + 2*n + 1 > capacity) return 64;
    for (size_t i=0; i<n; i++) snprintf(out+header+2*i, 3, "%02X", bytes[i]);
    return 0;
}
static int response_number(const char *prefix, unsigned *value) {
    const char *s=response; size_t len=strlen(prefix);
    while (*s) {
        if (!strncmp(s,prefix,len)) {
            const char *p=s+len; while (*p==' ') p++;
            if (*p<'0' || *p>'9') return 0;
            char *end; unsigned long n=strtoul(p,&end,10);
            if (n>65535 || (*end && *end!=',' && *end!='\r' && *end!='\n')) return 0;
            *value=(unsigned)n; return 1;
        }
        s=strpbrk(s,"\r\n"); if(!s) break;
        while (*s=='\r' || *s=='\n') s++;
    }
    return 0;
}
static int sms(const char *number, const uint16_t *text, size_t count) {
    size_t lengths[11], position=0;
    int total=0;
    while(position<count) {
        size_t len=count-position, limit=count<=70?70:67;
        if(len>limit) len=limit;
        if(position+len<count && text[position+len-1]>=0xd800 && text[position+len-1]<=0xdbff) len--;
        if(total==10) { fprintf(stderr,"SMS exceeds ten parts; nothing submitted\n"); return 64; }
        lengths[total++]=len; position+=len;
    }
    unsigned char ref;
    if (getrandom(&ref, 1, 0) != 1) return 74;
    int r = command("AT+CMGF=0", 0); if (r) return r;
    size_t offset = 0;
    for (int part = 1; part <= total; part++) {
        size_t len = lengths[part-1];
        unsigned char bytes[180]; char cmd[400];
        size_t n = pdu(bytes, number, text + offset, len, total, part, ref);
        r=sms_frame(cmd,sizeof cmd,bytes,n); if(r) return r;
        r=command(cmd,120000);
        unsigned reference=0, error=0;
        if (!r && !response_number("+CMGS:",&reference)) r=65;
        if (r) {
            /* Never retry: even a timed-out submission may have been sent. */
            fprintf(stderr, "SMS phase=submit-confirmation part=%d/%d confirmed=%d. Submission unconfirmed; do not automatically resend.\n", part,total,part-1);
            if (response_number("+CMS ERROR:",&error)) fprintf(stderr,"Modem SMS error=%u\n",error);
            else if (response_number("+CME ERROR:",&error)) fprintf(stderr,"Modem command error=%u\n",error);
            return r;
        }
        offset += len;
    }
    printf("SMS submitted: %d part(s)\n", total);
    return 0;
}
int main(int argc, char **argv) {
    const char *device = NULL, *host = NULL; int port = 20249, opt;
    signal(SIGPIPE, SIG_IGN); umask(077);
    while ((opt = getopt(argc, argv, "+d:h:p:t:")) != -1) {
        if (opt == 'd') device = optarg;
        else if (opt == 'h') host = optarg;
        else if (opt == 'p' || opt == 't') {
            char *end; long n = strtol(optarg, &end, 10);
            if (*end || n < 1 || n > (opt == 'p' ? 65535 : 180)) return 64;
            if (opt == 'p') port = (int)n; else timeout_ms = (int)n * 1000;
        } else return 64;
    }
    if (!!device == !!host || optind >= argc) return 64;
    int is_sms = !strcmp(argv[optind], "sms");
    uint16_t text[670]; size_t count = 0;
    if (is_sms) {
        if (argc - optind != 3 || !valid_number(argv[optind+1]) ||
            ucs2((const unsigned char *)argv[optind+2], text, &count)) {
            fprintf(stderr, "Invalid SMS: number and valid UTF-8 text required (maximum 670 UTF-16 code units).\n"); return 64;
        }
    } else {
        if (argc - optind != 2 || strcmp(argv[optind], "at")) return 64;
        const char *s = argv[optind+1];
        if (strncmp(s, "AT", 2) || strlen(s) > 4096) return 64;
        for (; *s; s++) if ((unsigned char)*s < 32 || (unsigned char)*s > 126) return 64;
    }
    int lock = lock_modem();
    if (lock < 0) { fprintf(stderr, "Modem busy or lock unavailable\n"); return 75; }
    struct stat lock_state;
    if(device && !fstat(lock,&lock_state) && lock_state.st_size>0) (void)poll(NULL,0,2000);
    int r = connect_modem(device, host, port);
    if (!r) {
        if (is_sms) r = sms(argv[optind+1], text, count);
        else { r = command(argv[optind+1], 0); fputs(response, stdout); }
    }
    if (r) fprintf(stderr, "MT5700M request failed (%d); no retry performed\n", r);
    if(device) {
        if(r==124 || r==74 || r==75) {
            if(ftruncate(lock,0) || pwrite(lock,"tainted",7,0)!=7) fprintf(stderr,"Unable to record serial quarantine\n");
        } else if(!r && ftruncate(lock,0)) fprintf(stderr,"Unable to clear serial quarantine\n");
    }
    if (fd >= 0) close(fd);
    close(lock); return r;
}
