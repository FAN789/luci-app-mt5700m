#!/usr/bin/env python3
"""Build isolated, offline-testable IPK/APK previews. Does not install/start services."""
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

source = Path(__file__).resolve().parents[1]
sdk = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
toolchain = next(sdk.glob('staging_dir/toolchain-*_musl'))
gcc = toolchain / 'bin/aarch64-openwrt-linux-musl-gcc'
apk = sdk / 'staging_dir/host/bin/apk'
po2lmo = sdk / 'staging_dir/hostpkg/bin/po2lmo'
env = dict(os.environ, STAGING_DIR=str(sdk / 'staging_dir'))

def run(*args):
    subprocess.run([str(a) for a in args], check=True, env=env)

def archive(root):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w:gz') as tar:
        for item in sorted(root.rglob('*')):
            info = tar.gettarinfo(str(item), './' + item.relative_to(root).as_posix())
            info.uid = info.gid = 0
            info.uname = info.gname = 'root'
            info.mtime = 0
            if item.is_file():
                with item.open('rb') as stream: tar.addfile(info, stream)
            else: tar.addfile(info)
    return data.getvalue()

with tempfile.TemporaryDirectory(prefix='mt5700m-pack-') as directory:
    work = Path(directory)
    keys = out.parent / 'preview-signing-keys'
    keys.mkdir(mode=0o700, exist_ok=True)
    private = keys / 'mt5700m-preview.pem'
    public = out / 'mt5700m-preview.pem.pub'
    if not private.exists():
        run('openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', private)
        private.chmod(0o600)
    run('openssl', 'pkey', '-in', private, '-pubout', '-out', public)
    packages = [
        ('mt5700m-transport', '1.0.1-r1', 'aarch64_cortex-a53', 'libc'),
        ('luci-app-mt5700m', '3.0.2-r1', 'all', 'luci-base, mt5700m-transport, flock, kmod-usb3, kmod-usb-serial, kmod-usb-serial-option, kmod-usb-net, kmod-usb-net-cdc-ether, kmod-usb-net-cdc-ncm'),
        ('luci-i18n-mt5700m-zh-cn', '3.0.2-r1', 'all', 'luci-app-mt5700m'),
    ]
    for name, version, arch, depends in packages:
        root = work / name / 'root'
        root.mkdir(parents=True)
        if name == 'mt5700m-transport':
            binary = root / 'usr/sbin/mt5700m-transport'
            binary.parent.mkdir(parents=True)
            run(gcc, '-static', '-Os', '-Wall', '-Wextra', '-Werror', '-fstack-protector-strong',
                '-D_FORTIFY_SOURCE=2', source / 'mt5700m-transport/src/transport.c', '-o', binary)
            run(toolchain / 'bin/aarch64-openwrt-linux-musl-strip', binary)
            run('file', binary)
        elif name == 'luci-app-mt5700m':
            shutil.copytree(source / name / 'root', root, dirs_exist_ok=True)
            shutil.copytree(source / name / 'htdocs', root / 'www', dirs_exist_ok=True)
        else:
            lmo = root / 'usr/lib/lua/luci/i18n/mt5700m.zh-cn.lmo'
            lmo.parent.mkdir(parents=True)
            run(po2lmo, source / 'luci-app-mt5700m/po/zh_Hans/mt5700m.po', lmo)
        for item in root.rglob('*'):
            rel = item.relative_to(root).as_posix()
            executable = rel.startswith(('usr/sbin/', 'usr/libexec/rpcd/', 'etc/init.d/', 'etc/hotplug.d/', 'etc/uci-defaults/'))
            item.chmod(0o755 if item.is_dir() or executable else 0o600 if rel.startswith(('etc/config/', 'etc/mt5700m/')) else 0o644)
        control = work / name / 'control'
        control.mkdir()
        (control / 'control').write_text(f'Package: {name}\nVersion: {version}\nArchitecture: {arch}\nMaintainer: Local build\nSection: luci\nPriority: optional\nLicense: Apache-2.0\nDepends: {depends}\nDescription: MT5700M native transport preview; manual activation required\n')
        if name == 'luci-app-mt5700m':
            (control / 'conffiles').write_text('/etc/config/mt5700m\n/etc/mt5700m/traffic-history\n')
        ipk = out / f'{name}_{version}_{arch}.ipk'
        with tarfile.open(ipk, 'w:gz') as tar:
            for filename, data in [('debian-binary', b'2.0\n'), ('control.tar.gz', archive(control)), ('data.tar.gz', archive(root))]:
                info = tarfile.TarInfo(filename); info.size = len(data); info.mode = 0o644
                tar.addfile(info, io.BytesIO(data))
        target = out / f'{name}-{version}.apk'
        run(apk, 'mkpkg', '--info', 'name:' + name, '--info', 'version:' + version,
            '--info', 'arch:' + ('noarch' if arch == 'all' else arch), '--info', 'license:Apache-2.0',
            '--info', 'description:MT5700M native preview; manual activation required',
            '--info', 'depends:' + depends.replace(', ', ' '), '--files', root,
            '--sign-key', private, '--output', target)
        run(apk, '--keys-dir', out, 'verify', target)
        with tarfile.open(ipk) as tar:
            assert set(tar.getnames()) == {'debian-binary', 'control.tar.gz', 'data.tar.gz'}
    (out / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(out.iterdir()) if p.is_file() and p.name != 'SHA256SUMS'))
print('Preview packages built and APK signatures verified. No device installation performed.')
