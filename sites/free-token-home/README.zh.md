# LeonMinGod 主站与免费 Token 首页

主站 https://leonmingod.com/ 使用重新生成的玉绿色手机竖图（941×1672）和电脑横图（1824×862），人物以免费 Token 海报中的同一位女性为参考。掌心流光略微放大，保留原有交互渲染器，配色改为青玉和淡金色。底部三个入口采用小号半透明椭圆胶囊，分别链接邮箱、免费 Token 和地址证明，避开人物伸出的手。

免费 Token 首页 https://leonmingod.com/free-token/ 的横、竖图铺满整个视口，移除底部占位和大矩形按钮。将画中玉牌的局部图层裁剪后叠加，加入轻微上下浮动和柔光，令牌上的可访问链接打开原领取页 /free-token/claim/。图片和点击区域使用同一画布中的相对坐标，满屏裁切、旋转和缩放后仍对齐。遵循减少动态效果的系统偏好。

2026-10-24 更新：入口与领取页通过 `src/token-scene.js` 复用首页的 `/vendor/fluid.js` 渲染器和青玉/淡金配色，支持指尖拖动与鼠标流光；特效层不拦截令牌、表单和弹窗操作，遵循减少动态效果偏好，页面隐藏或闲置时暂停。令牌浮动幅度约 7px，增加呼吸光晕与更明显的发光轮廓。`src/claim.js` 通过 HTMLRewriter 收紧原领取页，不改变原领取脚本；手机卡片最大 340px，短屏进一步收紧插画和纵向间距，确认按钮保持首屏可见。Render 地址、Key 和原主站 Worker 保持不变。

独立的 leonmingod-free-token Worker 通过 SITE 服务绑定读取原站。src/homepage.js 变换主站首页 HTML；src/home-scene.js 保存基于原交互脚本调整的玉绿色流光效果；src/landing.js 为满屏令牌入口。src/site-original.js 是备份，不参与部署。原主站 Worker、静态资源、领取 API 和 FREE_TOKEN_CPA_KEY 密钥继续保留在 Cloudflare。

根域与 www 的专用路由覆盖 /、/index.html、/free-token、/free-token/*、/home-hero-mobile-v4.webp、/home-hero-desktop-v4.webp 和 /home-scene-v4.js。带版本号的图片和脚本使用长期缓存，HTML 每次重新验证。

使用仓库现有 GitHub Secrets 和 codex/free-token-home-20261024 分支部署。deploy.py 校验已核对的主站、入口版本，不覆盖其他 Worker 的路由；发布后验证四张图片的哈希、导航、满屏入口、领取页和 API 的方法限制。失败时恢复入口旧版本并只移除本次新建路由。后续更新前需核对线上版本，再调整 EXPECTED_VERSION 与 EXPECTED_ENTRANCE_VERSION。

已用实际浏览器检查横、竖屏以及 320px 窄屏的入口排版，验证画面铺满、胶囊尺寸、与人物手部的间距和令牌点击位置。


2026-10-24 横屏主页导航更新：针对横屏与桌面视口，将主站底部三个入口迁移至 Logo/题字下方的湖面位置（参考圆心约 60.8%、69.9%、80.9%，直径约 92–136px），改用青玉绿色背景的圆形水晶质感按钮，图标置顶、文字居中纵排，支持悬浮微光放大动效；右上角流光控制与底部提示文字适当放大提高可读性；竖屏保持胶囊排版并在 390px/320px 窄屏优化内边距与间距防溢出。