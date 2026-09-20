#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="${RUNNER_TEMP:-/tmp}/mt5700m-sdk"
output_dir="${repo_dir}/dist-release"
sdk_version="${SDK_VERSION:-25.12.5}"
base_url="https://downloads.openwrt.org/releases/${sdk_version}/targets/mediatek/filogic"

mkdir -p "${work_dir}" "${output_dir}"
find "${output_dir}" -mindepth 1 -maxdepth 1 -delete
cd "${work_dir}"
curl -fsSLO "${base_url}/sha256sums"
archive="$(awk '/openwrt-sdk-.*Linux-x86_64\.tar\.zst$/ { print $2; exit }' sha256sums | sed 's/^\*//')"
test -n "${archive}"
curl -fL --retry 5 "${base_url}/${archive}" -o "${archive}"
grep "[ *]${archive}$" sha256sums | sha256sum -c -
tar --zstd -xf "${archive}"
sdk_dir="$(find "${work_dir}" -maxdepth 1 -type d -name 'openwrt-sdk-*' | head -n 1)"
test -n "${sdk_dir}"

cd "${sdk_dir}"
./scripts/feeds update -a
./scripts/feeds install luci-base

perl -0pi -e 's/(config ALL\n\s+bool "Select all userspace packages by default"\n\s+default )y/${1}n/' Config.in
perl -0pi -e 's/(config TARGET_MULTI_PROFILE\n\s+bool\n\s+default )y/${1}n/; s/(config TARGET_ALL_PROFILES\n\s+bool\n\s+default )y/${1}n/; s/(config TARGET_DEVICE_mediatek_filogic_DEVICE_[^\n]+\n\s+bool\n\s+default )y/${1}n/g' Config-build.in
sed -i 's/^[[:space:]]*default m$/\tdefault n/' Config-build.in

mkdir -p package/h5000m-custom
cp -a "${repo_dir}/luci-app-mt5700m" package/h5000m-custom/
cp -a "${repo_dir}/mt5700m-transport" package/h5000m-custom/
cat > .config <<'EOF'
CONFIG_TARGET_mediatek=y
CONFIG_TARGET_mediatek_filogic=y
# CONFIG_ALL is not set
# CONFIG_ALL_KMODS is not set
# CONFIG_ALL_NONSHARED is not set
CONFIG_PACKAGE_luci-app-mt5700m=m
CONFIG_LUCI_LANG_zh_Hans=y
CONFIG_PACKAGE_mt5700m-transport=m
# CONFIG_PACKAGE_luci-app-qmodem is not set
# CONFIG_PACKAGE_luci-app-qmodem-next is not set
# CONFIG_PACKAGE_qmodem is not set
# CONFIG_PACKAGE_modem_scan is not set
# CONFIG_PACKAGE_tom_modem is not set
EOF
make defconfig
make package/h5000m-custom/mt5700m-transport/compile -j"$(nproc)" V=s
make package/h5000m-custom/luci-app-mt5700m/compile -j"$(nproc)" V=s

find bin -type f \( -name 'luci-app-mt5700m-*.apk' -o -name 'luci-app-mt5700m_*.ipk' -o -name 'luci-i18n-mt5700m-zh-cn-*.apk' -o -name 'luci-i18n-mt5700m-zh-cn_*.ipk' -o -name 'mt5700m-transport-*.apk' -o -name 'mt5700m-transport_*.ipk' \) -exec cp -f {} "${output_dir}/" \;
test "$(find "${output_dir}" -type f \( -name '*.apk' -o -name '*.ipk' \) | wc -l)" -ge 3
if find "${output_dir}" -name '*.apk' | grep -q .; then
  cp public-key.pem "${output_dir}/openwrt-sdk-build.pem"
fi
printf 'SDK=%s\nSOURCE_COMMIT=%s\nTARGET=mediatek/filogic\n' "$sdk_version" "$(git -C "$repo_dir" rev-parse HEAD)" > "${output_dir}/BUILD-INFO.txt"
grep "[ *]${archive}$" "${work_dir}/sha256sums" >> "${output_dir}/BUILD-INFO.txt"
(cd "${output_dir}" && find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
