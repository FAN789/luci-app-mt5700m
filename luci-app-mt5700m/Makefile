include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mt5700m
PKG_VERSION:=2.3.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=MT5700M module management
LUCI_DEPENDS:=+luci-base +ubus-at-daemon +sms-tool_q
LUCI_EXTRA_DEPENDS:=kmod-usb2 (>=0), kmod-usb3 (>=0), kmod-usb-serial (>=0), kmod-usb-serial-option (>=0), kmod-usb-net (>=0), kmod-usb-net-cdc-ether (>=0), kmod-usb-net-cdc-ncm (>=0)
LUCI_PKGARCH:=all

define Package/luci-app-mt5700m/conffiles
/etc/config/mt5700m
/etc/mt5700m/traffic-history
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
