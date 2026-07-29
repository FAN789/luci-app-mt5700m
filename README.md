# MT5700M Manager for OpenWrt

[![CI](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/ci.yml/badge.svg)](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/ci.yml)
[![Build Release](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/release.yml/badge.svg)](https://github.com/FAN789/luci-app-mt5700m/actions/workflows/release.yml)

专门面向移远 MT5700M-CN 5G 模组的 OpenWrt LuCI 管理器。它把状态、移动
数据、网络与小区、短信、系统维护和 AT 终端统一到一个应用中，并按照 MT5700M
手册识别 USB 正常、升级和 Dump 模式。

版本采用标准的 `主版本.次版本.修订版本-r打包修订` 格式。`2.2.0` 按最终用户的
使用路径重构了信息架构；当前开发版本为 `v2.3.0`，OpenWrt 安装包为
`2.3.0-r1`。该版本修正小区扫描的离网、长时后台扫描与自动恢复注册流程，
并将扫描结果整理为可读表格；同时对复合 USB 热插拔事件进行防抖，避免启动时
重复绑定模组导致 LAN DHCPv4 获取延迟。流量接口改为动态识别，并把状态查询与
可写 AT 操作分权；未出现在官方手册且实体模块不支持的 Direct IP 控件已移除。

## 主要功能

- 首页优先展示信号质量、载波聚合、IPv4/IPv6 与移动流量
- 网关、DNS、PDP 会话和模组原生计数集中到“移动数据”页面
- 模组身份、手机号、SIM 信息和签约速率集中到“模组与 SIM 卡”页面
- RSRP/RSRQ/SINR 等信号质量的人性化显示
- APN、PDP、漫游和移动数据连接管理
- 网络制式、LTE/WCDMA 频段及小区锁定
- 短信收发与联系人友好的列表界面
- IMEI、手机号、签约速率、USB/网口状态及系统维护
- 高级页面统一收纳 USB/PCIe、通信诊断和 MT5700M 专用 AT 终端入口
- 定期缓存模组温度，供 H5000M 风扇控制等本机组件低开销共享
- 简体中文界面；不依赖云服务，不上传模组或 SIM 数据

流量历史由应用直接读取 MT5700M 数据接口的内核计数，不依赖 `vnStat`，并保存在
`/etc/mt5700m/traffic-history`。升级自早期独立流量插件时会自动迁移已有记录；不再
安装或显示单独的“流量统计”应用。

## 安装和编译

源码包位于 `luci-app-mt5700m/`：

```sh
git clone https://github.com/FAN789/luci-app-mt5700m.git
cp -a luci-app-mt5700m/luci-app-mt5700m /path/to/openwrt/package/
make menuconfig
# LuCI -> Applications -> luci-app-mt5700m
make package/luci-app-mt5700m/compile V=s
```

应用依赖 `ubus-at-daemon`、`sms-tool_q` 及 OpenWrt 官方 USB 串口/网卡内核模块。
每个 GitHub Release 均由 GitHub Actions 使用官方 OpenWrt SNAPSHOT
`mediatek/filogic` SDK 在线构建，附带应用、中文包、两个底层传输包、SDK 构建公钥
和 SHA256 校验文件。安装时必须使用与设备固件 ABI/内核版本相匹配的软件源。

## 设计边界

本项目不是通用蜂窝模组框架，只实现 MT5700M 所需的能力。低层 AT 与短信传输
包来自固定版本的 [FUjr/QModem](https://github.com/FUjr/QModem)，应用内的精简
实现保留了来源说明，详见
[`QMODEM-NOTICE`](luci-app-mt5700m/root/usr/share/mt5700m/QMODEM-NOTICE)。
该部分受其上游 MPL-2.0 和非商业限制约束，适用于个人、非商业用途。

本仓库自行编写的代码按 [Apache License 2.0](LICENSE) 发布。
