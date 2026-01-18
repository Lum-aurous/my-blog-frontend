import { defineStore } from "pinia";
import { api } from "@/utils/api";

export const useSiteStore = defineStore("site", {
  state: () => ({
    siteInfo: {
      site_title: "Veritas",
      site_slogan: "看见真理",
      site_author: "Jack",
      site_logo: "",
      site_favicon: "",
      site_keywords: "",
      site_desc: "",
      icp_beian: "",
      footer_html: "",
    },
    isLoaded: false,
  }),

  actions: {
    async fetchSiteInfo() {
      // 如果已经加载过，就不重复请求了（除非强制刷新）
      if (this.isLoaded) return;

      try {
        const res = await api.get("/site/configs");
        if (res.data.success && res.data.data) {
          // 合并数据，保留默认值
          this.siteInfo = { ...this.siteInfo, ...res.data.data };
          this.isLoaded = true;

          // 🔥 立即应用 SEO 和 Favicon
          this.updateHead();
        }
      } catch (error) {
        console.error("获取站点配置失败:", error);
      }
    },

    // 动态更新 Head 信息 (Title, Meta, Favicon)
    updateHead() {
      const info = this.siteInfo;

      // 1. 更新浏览器标题
      document.title =
        info.site_title + (info.site_slogan ? ` - ${info.site_slogan}` : "");

      // 2. 更新 Favicon
      if (info.site_favicon) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.getElementsByTagName("head")[0].appendChild(link);
        }
        link.href = info.site_favicon;
      }

      // 3. 更新 Meta Keywords
      if (info.site_keywords) {
        let metaKeys = document.querySelector("meta[name='keywords']");
        if (!metaKeys) {
          metaKeys = document.createElement("meta");
          metaKeys.name = "keywords";
          document.head.appendChild(metaKeys);
        }
        metaKeys.content = info.site_keywords;
      }

      // 4. 更新 Meta Description
      if (info.site_desc) {
        let metaDesc = document.querySelector("meta[name='description']");
        if (!metaDesc) {
          metaDesc = document.createElement("meta");
          metaDesc.name = "description";
          document.head.appendChild(metaDesc);
        }
        metaDesc.content = info.site_desc;
      }
    },
  },
});
