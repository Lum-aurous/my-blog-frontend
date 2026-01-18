// src/router.js
import { createRouter, createWebHistory } from "vue-router";
import { useUserStore } from "@/stores/user.js";
import { message } from "@/utils/message.js";

// 前台组件
import Home from "@/views/Home.vue";
import Blog from "@/views/Blog.vue";
import ArticleDetail from "@/views/ArticleDetail.vue";
import Profile from "@/views/Profile.vue";
import Account from "@/views/Account.vue";

const Travel = () => import("@/views/Travel.vue");
const Guestbook = () => import("@/views/Guestbook.vue");
const RecordLayout = () => import("@/views/RecordLayout.vue");
const Contact = () => import("@/views/Contact.vue");
const Toolkit = () => import("@/views/Toolkit.vue");

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ==================== 核心页面 (前台) ====================
    {
      path: "/",
      component: Home,
      meta: { title: "Veritas - 首页", guestAccess: true },
    },
    {
      path: "/blog",
      component: Blog,
      meta: { title: "Veritas - 博客", guestAccess: true },
    },
    {
      path: "/article/:id",
      component: ArticleDetail,
      meta: { title: "Veritas - 文章详情", guestAccess: true },
    },
    {
      path: "/column/:id",
      name: "ColumnDetail",
      component: () => import("@/views/ColumnDetail.vue"),
      props: true,
    },
    {
      path: "/travel",
      name: "Travel",
      component: Travel,
      meta: { title: "Veritas - 游记", guestAccess: true },
    },
    {
      path: "/comments",
      name: "Guestbook",
      component: Guestbook,
      meta: { title: "Veritas - 留言", guestAccess: true },
    },

    // 🔥🔥🔥 优化点在这里：增加父级路径的重定向 🔥🔥🔥
    {
      path: "/records",
      // 当访问 /records 时，自动跳到第一个子分类 'life'
      redirect: "/records/life",
    },
    {
      path: "/records/:type",
      name: "RecordCategory",
      component: RecordLayout,
      meta: {
        title: "Veritas - 记录",
        guestAccess: true,
      },
      beforeEnter: (to, from, next) => {
        const validTypes = ["life", "media", "study", "travel", "resources"];
        if (validTypes.includes(to.params.type)) {
          next();
        } else {
          next("/404");
        }
      },
    },
    // 🔥🔥🔥 优化结束 🔥🔥🔥

    {
      path: "/contact",
      name: "Contact",
      component: Contact,
      meta: { title: "Veritas - 联系我", guestAccess: true },
    },
    {
      path: "/toolkit",
      name: "Toolkit",
      component: Toolkit,
      meta: { title: "Veritas - 百宝箱", guestAccess: true },
    },

    // ==================== 用户系统 ====================
    {
      path: "/login",
      component: () => import("@/views/Login.vue"),
      meta: {
        title: "Veritas - 登录",
        guestAccess: true,
        preventIfLoggedIn: true,
        hideGlobalWallpaper: true,
      },
    },
    // 🔥 必须把这个加回来！否则 router.push('/register') 会跳到首页
    {
      path: "/register",
      name: "Register",
      // 🔥 关键点：这里依然加载 Login.vue 组件
      component: () => import("@/views/Login.vue"),
      meta: {
        title: "Veritas - 注册",
        guestAccess: true,
        preventIfLoggedIn: true,
        hideGlobalWallpaper: true,
      },
    },
    {
      path: "/profile/:username",
      name: "Profile",
      component: Profile,
      meta: { title: "个人主页", guestAccess: true },
    },
    {
      path: "/account",
      component: Account,
      meta: { title: "Veritas - 个人中心", requiresAuth: true },
    },
    {
      path: "/creation-center",
      name: "CreationCenter",
      component: () => import("@/views/CreationCenter.vue"),
      meta: { requiresAuth: true, title: "创作中心 - Veritas" },
    },
    {
      path: "/copyright",
      name: "Copyright",
      component: () => import("@/views/CopyrightDetail.vue"),
      meta: { title: "版权声明 - Veritas", guestAccess: true },
    },

    // ==================== 🔥 后台管理系统 (Admin) ====================
    {
      path: "/admin",
      component: () => import("@/views/admin/AdminLayout.vue"),
      meta: {
        title: "Veritas - 后台管理",
        requiresAuth: true,
        requiresRole: "admin",
      },
      children: [
        {
          path: "",
          redirect: "/admin/dashboard",
        },
        {
          path: "dashboard",
          name: "AdminDashboard",
          component: () => import("@/views/admin/Dashboard.vue"),
          meta: { title: "后台 - 仪表盘" },
        },
        {
          path: "publish",
          name: "AdminPublish",
          component: () => import("@/views/admin/ContentPublish.vue"),
          meta: { title: "后台 - 内容发布" },
        },
        {
          path: "contents",
          name: "AdminContents",
          component: () => import("@/views/admin/ContentList.vue"),
          meta: { title: "后台 - 内容管理" },
        },
        {
          path: "comments",
          name: "AdminComments",
          component: () => import("@/views/admin/CommentList.vue"),
          meta: { title: "后台 - 评论管理", requiresRole: "admin" },
        },
        {
          path: "users",
          name: "AdminUsers",
          component: () => import("@/views/admin/UserList.vue"),
          meta: { title: "后台 - 用户管理", requiresRole: "admin" },
        },
        {
          path: "notices",
          name: "AdminNotices",
          component: () => import("@/views/admin/NoticeList.vue"),
          meta: { title: "后台 - 公告管理", requiresRole: "admin" },
        },
        {
          path: "friends",
          name: "AdminFriendLink",
          component: () => import("@/views/admin/FriendLinkList.vue"),
          meta: { title: "后台 - 友链管理", requiresRole: "admin" },
        },
        {
          path: "wallpapers",
          name: "AdminWallpapers",
          component: () => import("@/views/admin/WallpaperManage.vue"),
          meta: { title: "后台 - 壁纸管理", requiresRole: "admin" },
        },
        {
          path: "copyright",
          name: "AdminCopyright",
          component: () => import("@/views/admin/CopyrightManage.vue"),
          meta: { title: "后台 - 版权声明", requiresRole: "admin" },
        },
        {
          path: "tools",
          name: "Toolkits",
          component: () => import("@/views/admin/ToolManage.vue"),
          meta: { title: "后台 - 工具管理", requiresRole: "admin" },
        },
        {
          path: "poems",
          name: "Poems",
          component: () => import("@/views/admin/PoemManage.vue"),
          meta: { title: "后台 - 诗词管理", requiresRole: "admin" },
        },
        {
          path: "config",
          name: "GlobalConfig",
          component: () => import("@/views/admin/GlobalConfig.vue"),
          meta: { title: "后台 - 全局配置", requiresRole: "admin" },
        },
        {
          path: "emails",
          name: "EmailLogs",
          component: () => import("@/views/admin/EmailLogs.vue"),
          meta: { title: "后台 - 邮件监控", requiresRole: "admin" },
        },
        {
          path: "messages",
          name: "Messages",
          component: () => import("@/views/admin/Messages.vue"),
          meta: { title: "后台 - 留言信箱", requiresAdmin: true },
        },
      ],
    },

    // ==================== 404 页面 ====================
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],

  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0, behavior: "smooth" };
    }
  },
});

// ==================== 🛡️ 全局前置守卫 ====================
router.beforeEach(async (to, from, next) => {
  // 1. 设置标题
  if (to.meta.title) {
    document.title = to.meta.title;
  }

  // 2. 获取 Store 和 Token
  const userStore = useUserStore();
  const token = localStorage.getItem("token");

  if (token && !userStore.user) {
    try {
      await userStore.checkLoginStatus();
    } catch (e) {
      console.error("恢复登录状态失败", e);
    }
  }

  const isLoggedIn = !!token;
  const isSwitchingAccount =
    sessionStorage.getItem("isSwitchingAccount") === "true";

  // 3. 防止已登录用户访问登录/注册页
  if (to.meta.preventIfLoggedIn && isLoggedIn) {
    if (isSwitchingAccount && to.path === "/login") return next();
    message.info("您已登录，无需重复操作");
    return next("/");
  }

  // 4. 不需要权限的页面直接放行
  if (to.meta.guestAccess) {
    return next();
  }

  // 5. 检查是否需要登录
  if (to.meta.requiresAuth) {
    if (!isLoggedIn) {
      message.warning("请先登录");
      if (to.path !== "/login")
        sessionStorage.setItem("redirectPath", to.fullPath);
      return next("/login");
    }

    // 6. 检查角色权限
    if (to.meta.requiresRole) {
      const currentUserRole = userStore.user?.role;
      if (currentUserRole !== to.meta.requiresRole) {
        message.error("您没有管理员权限，无法访问后台！");
        return next("/");
      }
    }
  }

  next();
});

// ==================== 路由后置钩子 ====================
router.afterEach((to, from) => {
  if (from.path === "/login" && to.path === "/") {
    const redirectPath = sessionStorage.getItem("redirectPath");
    if (redirectPath && redirectPath !== "/login") {
      sessionStorage.removeItem("redirectPath");
      setTimeout(() => {
        router.push(redirectPath);
      }, 100);
    }
  }
});

export default router;
