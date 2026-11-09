---
name: release
description: 发布 Nightstand 新版本：升版本号、跑完检查、打 tag 并创建 GitHub release，再通过专用 Chrome profile 把软件包、商品详情、截图和隐私权表单提交到 Chrome 网上应用店审核。用户说“发布”“发版”“上架”“提交商店”“打 release”时使用。
---

# 发布 Nightstand

整个流程分两段：仓库内（版本号、检查、tag、GitHub release），以及 Chrome 网上应用店开发者后台（上传、更新详情、提交审核）。商店后台在内置浏览器里打不开，要用一个专用 Chrome profile，再通过 `chrome-devtools` MCP 操作。

## 0. 先问用户

- **版本号**：看 `git log <上一个 tag>..HEAD`。有新功能就升次版本号（0.1.0 → 0.2.0），只有修复就升修订号。把建议列出来让用户选。
- 版本号提交直接推到 main（0.2.0 就是这样，用户确认过），不另开 PR。

## 1. 仓库内

1. 版本号在三个地方，一起改：`apps/extension/src/manifest.json`、`apps/extension/package.json`、`packages/core/package.json`（`git grep -n '"version"'` 核对）。
2. 检查：`pnpm lint && pnpm type-check && pnpm test`，然后 `pnpm test:e2e`（大约 2 分钟，放后台跑）。
3. 打包和商店图片：先 `rm -rf apps/extension/dist/store`（防止旧截图残留），再运行 `pnpm run store`。它会生成 `apps/extension/dist/nightstand-<版本>-chromium.zip` 和 `dist/store/{en,zh_CN}/` 下的截图与宣传图。
   - 用 `unzip -p <zip> manifest.json | grep version` 确认版本号。
   - 用 `file dist/store/*/*.png` 确认图片是 `8-bit/color RGB`：商店拒收带 alpha 通道的图。
   - 商店每种语言**最多 5 张截图**。`store/copy.ts` 的 `shots` 必须保持在 5 张以内。
4. Firefox 包（作为 release 附件）：`cd apps/extension && pnpm exec extension build --browser firefox --zip`，产出 `dist/nightstand-<版本>-firefox.zip`。
5. 提交：`git commit -m "chore: release X.Y.Z"`（末尾加 Co-Authored-By），然后 `git tag -a vX.Y.Z -m "Nightstand X.Y.Z"`，再 `git push origin main vX.Y.Z`。
6. 先在 scratchpad 里写好 release notes，再运行 `gh release create vX.Y.Z --title "Nightstand X.Y.Z" --notes-file <notes> <两个 zip>`。
   - 格式：英文在前，`---` 分隔，中文在后；各分“新功能 / Fixes / Install”几节，参考 v0.2.0。
   - 新增权限要专门说明：更新时浏览器会要求用户确认新权限。
   - Install 一节写商店链接 <https://chromewebstore.google.com/detail/eecdbcolgdacjpmmbcdankdmeihmfbhd>，并注明“X.Y.Z 正在审核”。

## 2. Chrome 网上应用店

### 打开专用 profile

```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/nightstand-cws-chrome" https://chrome.google.com/webstore/devconsole
```

用 `curl -s http://127.0.0.1:9222/json/version` 等它起来，再用 `mcp__chrome-devtools__list_pages` 连上。如果页面跳到了 `accounts.google.com`，**让用户自己在那个窗口里登录**，绝不代填凭据，登录好后再继续。

后台地址（发布者 Mica；账号下还有别的扩展，不要碰）：

- 发布者 ID：`e3868466-425c-4e08-bba0-3f6e023f56d9`
- 商品 ID：`eecdbcolgdacjpmmbcdankdmeihmfbhd`
- 编辑页：`https://chrome.google.com/webstore/devconsole/<发布者>/<商品>/edit/{package,listing,privacy,distribution,status}`

### 操作要点（这个后台的特殊之处）

- 按钮多数是 `div[role=button]`，不是 `<button>`。用 JS 点击时，先派发 `mousedown`、`mouseup` 再调 `.click()`，否则不起作用。点 snapshot 里的 uid（`mcp__chrome-devtools__click`）总是可靠的。
- 大段文字用 `mcp__chrome-devtools__fill` 填写，然后用 `evaluate_script` 读 `textarea.value.length` 和结尾核对。
- 每改完一页（以及切换语言之前），都点“保存草稿”。看 `[aria-live]` 里的“已成功保存内容”，或者等“保存草稿”按钮变灰。
- `take_snapshot` 的 `filePath` 只能写在仓库里（例如 `apps/extension/dist/snap.txt`，dist 被 gitignore），用完删掉。

### 步骤

1. **文件包**（`edit/package`）：点“上传新的软件包”，对弹窗里“选择文件”的 uid 调用 `mcp__chrome-devtools__upload_file`，传入 chromium zip。处理完成后会自动跳到商品详情页。
2. **商品详情**（`edit/listing`）：
   - 语言下拉框默认是“英语 – en”。说明文字填 `apps/extension/store/description.en.txt`，然后保存草稿。
   - 切到“中文（中国） – zh-CN”，填 `description.zh_CN.txt`，然后保存草稿。
   - 截图：**全球通用的屏幕截图 = `dist/store/en/`**，**zh-CN 的“以当地语言显示的屏幕截图” = `dist/store/zh_CN/`**。
     - 删除截图：点 `[role=button][aria-label^="移除图片 屏幕截图"]`，会弹出确认框，点框里的“移除”。全球通用的截图在 `[data-is-global="true"]` 里，本地化的没有这个标记；只删自己要换的那一组。
     - 上传截图：对“全球通用的屏幕截图 * 将图片拖放到此处”或“以当地语言显示的屏幕截图 * 将图片拖放到此处”的 uid 调用 `upload_file`，**每次一张**，按编号顺序传。偶尔会报 “could not accept the file”，重试一次就好。
     - 宣传图块是全球通用的；只有宣传图的文案或伪装界面变了才需要换。
   - 截完图截屏核对一遍顺序，然后保存草稿。
3. **隐私权**（`edit/privacy`）：对照 `apps/extension/store/README.md` 的“隐私权”一节逐项核对：单一用途、每个权限的理由、主机权限理由。“数据使用”只勾“网络记录”，三条声明全部勾选。改完保存草稿。
4. **提交**：点“提请审核”。
   - 确认框里“通过审核后自动发布”默认是勾选的，保持不变，点“提交审核”。
   - 因为申请了所有网站的主机权限，会再弹一个“发布将被推迟……深入审核”。遮罩功能本来就需要这个权限，直接点“提请审核”。
   - 最后状态应显示“待审核”。

### 常见卡点

- **“我为何无法提交？”提示“无法访问首页网址 / 隐私权政策链接，连接超时”**：GitHub 偶尔很慢或返回 504（`curl -w '%{http_code} %{time_total}'` 可以确认）。等一会儿，把隐私权政策网址原样重新填一遍，再保存草稿；重新加载商品详情页后，“提请审核”通常就能点了。
- 提交审核前在“文件包”页确认草稿版本号已经是新版本。

## 3. 收尾

- 如果 release notes 里还没有商店链接，用 `gh release edit vX.Y.Z --notes-file <notes>` 补上。
- 如果过程中改了仓库文件（例如截图脚本），按项目规范运行 lint / type-check 后提交。
- 告诉用户：商店状态（待审核、是否走深入审核）、release 地址，以及这次没做的事（Firefox AMO 没有自动上架，需要手动上传并签名）。
