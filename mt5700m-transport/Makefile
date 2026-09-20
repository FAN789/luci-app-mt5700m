include $(TOPDIR)/rules.mk

PKG_NAME:=mt5700m-transport
PKG_VERSION:=1.0.1
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
include $(INCLUDE_DIR)/package.mk

define Package/mt5700m-transport
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Native MT5700M serial and SMS transport
  DEPENDS:=+libc
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) ./src/* $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(TARGET_CC) $(TARGET_CFLAGS) -Wall -Wextra -Werror -o $(PKG_BUILD_DIR)/mt5700m-transport $(PKG_BUILD_DIR)/transport.c $(TARGET_LDFLAGS)
endef

define Package/mt5700m-transport/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mt5700m-transport $(1)/usr/sbin/
endef

$(eval $(call BuildPackage,mt5700m-transport))
