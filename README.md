# MT5700M Manager for OpenWrt

[![CI](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/ci.yml/badge.svg)](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/ci.yml)
[![Build Release](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/release.yml/badge.svg)](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/release.yml)

面向鼎桥（TD Tech）MT5700M-CN 5G 模组的 OpenWrt LuCI 管理插件。
当前发布版本 **v3.0.3**：应用 `3.0.3-r1`，原生传输程序 `1.0.1-r1`。
这是插件包，不是整机固件，不包含个人网络配置、短信、SIM 数据或登录凭据。

## 3.0.3 更新

3.0.3 为 SDK 刚生成的未签名 APK 执行显式签名和严格验签，修正 3.0.2 的签名输入处理；不要使用 3.0.1 的未签名 APK。
3.0.1 修复首次 3.0.0 在线构建发现的 SDK 打包目录创建问题；下列运行时功能与已验收的 3.0.0-r7 / 1.0.0-r6 相同。

- 自有 C 程序 `mt5700m-transport` 负责串口/TCP AT 和短信传输；运行时不再依赖 `ubus-at-daemon`、`sms-tool_q` 或 QModem 服务。
- 按 MT5700M 命令格式修复短信发送；后台发送任务显示进度和明确结果，确认不明时不自动重发，以免重复发送和计费。
- 支持中文及 emoji 的 UTF-16 编码、多段短信和代理对边界检查。发送成功确认不等于运营商投递报告。
- 整个模组操作串行化、缓存发布锁、串口同步探测及超时隔离，降低并发操作和迟到响应造成的误判。
- APN/自动拨号变更先保存旧配置，写入后核对；失败或中断后使用持久日志恢复。
- 区分“数据链路已连接”和“互联网验证通过”；检测蜂窝租约不一致及联网失败，先续租、再按条件恢复数据会话，并设置冷却时间和每小时次数上限。
- 修复 BusyBox 环境等待兼容性和服务实例管理；短信空间接近满额时提示，不自动删除旧短信。
- 新安装默认使用蜂窝 IPv4/IPv6 双栈。升级保留已有用户配置，不强制覆盖 PDP/APN。运营商是否提供 IPv6 取决于 SIM、APN 与网络。

## 功能与边界

提供信号、载波聚合、模组/SIM 状态、APN/PDP、连接与重拨、网络制式与频段、小区查询、短信、流量历史、温度缓存及 AT 终端。
流量历史保存在 `/etc/mt5700m/traffic-history`；短信发送历史为浏览器本地记录，支持现有导入/导出功能，不是跨设备同步服务。

蜂窝 WAN IPv6 与 LAN IPv6 分发是不同设置。插件不擅自开启或禁用 LAN 的 RA/DHCPv6/NDP，也不替用户改变代理软件的 IPv6 策略。
健康检查使用蜂窝接口访问公共 HTTPS 端点；不提交短信、身份信息或凭据，但端点会像普通网页访问一样看到来源 IP。
当前健康检查不是独立的 IPv6 可达性验收；不能把健康状态当成所有 IPv6 目的站点均可达的保证。

## 验证情况

H5000M + KWRT（Linux 6.12.108）实机已验证 AT 查询、管理服务自启动、蜂窝 IPv4 HTTPS、断线/租约恢复、APN 失败回滚、整机重启及断电冷启动。
单段短信已由接收端确认收到；emoji 编码做过模组存储/读取验证，未据此宣称真实多段/emoji 投递已验收。
蜂窝 IPv6 地址和路由、指定 IPv6 端点的 TLS/HTTP 已验证，不代表所有 IPv6 域名解析和站点均已通过。

自动测试包含 19 项原生传输模拟测试、shell 回归、UI 错误处理、短信解码/任务、健康恢复和配置回滚测试。
多日运行、所有运营商组合和具有破坏性的高级设置未穷尽测试；无标签 AT 协议也无法保证任意迟到响应都能绝对隔离。
修改频段、SIM/PIN、固件或发送短信前，应明确了解断网、数据丢失和计费风险。

## 安装

在 [Releases](https://github.com/FAN789/luci-app-mt5700m/releases) 下载对应构建的归档并核对 SHA256。
自动构建提供 `mediatek/filogic` 的两套独立产物：OpenWrt 24.10.8 SDK 的 IPK，以及 25.12.5 SDK 的 APK。
每套包含应用、简体中文包、`mt5700m-transport` 和校验文件；APK 构建另附签名公钥。
原生传输包面向 `aarch64_cortex-a53`；LuCI 页面虽为架构无关包，仍依赖匹配的原生传输包。

1. 备份配置，确认设备架构、libc/用户空间 ABI 和包管理器。不要同时安装 IPK/APK，不要强制跳过依赖。
2. 从**当前固件的软件源**安装 USB 驱动：`kmod-usb3`、`kmod-usb-serial`、`kmod-usb-serial-option`、`kmod-usb-net`、`kmod-usb-net-cdc-ether`、`kmod-usb-net-cdc-ncm`。不得跨内核复制驱动。
3. 确认有 `luci-base`、`flock`、`curl` 与 DHCPv6 客户端 `odhcp6c`。`curl` 用于联网健康探测；缺少时不会盲目触发网络恢复。
4. 安装对应格式的传输包、应用包和中文包。APK 公钥只应在核对来源后加入系统信任目录，不要使用跳过签名检查选项。
5. 停止其他会占用同一 AT 串口的模组管理服务，再在 LuCI 中配置并启用本插件。首次启用或升级可能触发拨号，需预留维护窗口。

KWRT 等衍生固件可能保留不同包格式/依赖版本，不能仅凭版本名称判断兼容性。自动发布包仍需在目标系统确认依赖；实机验证不等于所有衍生固件通用认证。

## 源码编译与自动发布

```sh
git clone https://github.com/FAN789/luci-app-mt5700m.git
cp -a luci-app-mt5700m/luci-app-mt5700m /path/to/openwrt/package/
cp -a luci-app-mt5700m/mt5700m-transport /path/to/openwrt/package/
cd /path/to/openwrt
make menuconfig
# LuCI -> Applications -> luci-app-mt5700m
make package/mt5700m-transport/compile V=s
make package/luci-app-mt5700m/compile V=s
```

推送与 PR 运行 CI；推送匹配应用版本的 `v*` 标签会先执行测试，再通过官方 SDK 自动编译并发布 Release。
手动运行 Build Release 只保存 Actions 产物，不创建版本。SDK 下载校验和及构建信息随产物保留；签名私钥不发布。
`scripts/build-native-preview.py` 仅用于本地实验包，不能替代 SDK 正式构建与目标系统验收。

## 来源与许可

本仓库自行编写的代码按 [Apache License 2.0](LICENSE) 发布。
历史上参考/精简 QModem 行为的部分仍保留 [QMODEM-NOTICE](luci-app-mt5700m/root/usr/share/mt5700m/QMODEM-NOTICE) 的来源及许可边界；移除运行依赖不等于移除历史归属说明。
