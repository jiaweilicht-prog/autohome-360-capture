# 数据抓取 · 360° 内饰全景采集工具链

> **位置**：`~/WorkBuddy/数据抓取/` —— ⚠️ **在 DDGS 项目根之外**（刻意如此，见文末）
> **建立**：2026-09 起持续迭代
> **身份**：DDGS 的**外部数据源工具链**，不是 DDGS 的子项目；但它产出的素材是 DDGS 的输入

---

## 一句话

**把汽车之家 360° 全景内饰图，按统一视角批量抓下来、统一命名、质检入库的那套机器。**
它回答的问题是：**「某台车的 F1/R1 视角证据图，去哪儿拿、怎么保证每张都拍同一个角度」**。

---

## 目录结构

| 目录 / 文件 | 是什么 | 体量 |
|---|---|---|
| **`probe/`** | **工具链本体** —— 140+ 个采集 / 标定 / 核验脚本（`discover.cjs` 发现 · `run-p0.cjs`/`run-p1.cjs` 采集 · `calibrate*.cjs` 角度标定 · `ah_pic_*.py` 出图 · `verify_*.cjs`/`smoke*.cjs` 核验）| 206 文件 / 2.8 MB |
| `output/` | **采集产物**：`captured_cars.csv` 台账 + 按区域/视角切好的图 + 各类 report | 109,207 文件 / **12 GB** |
| `docs/` | **口径与结论**：各系全量采集报告、可采集车型目录、视角规范、Layer1 数据源映射 | 18 文件 / 404 KB |
| `config/` | 车型发现与品牌统一的配置/中间态（`*-targets.json`、`all_series.json`、`brand_unify_log.json`…）| 70 文件 / 2.7 MB |
| `NEXTD抓取/` | 另一条采集线（NEXTD），含 `任务说明.md` + 改名脚本 | 24 文件 / 2.3 MB |
| `.clipvenv/` | CLIP 图像打分的专用虚拟环境 | — |
| `probe.py` / `数据抓取的config.zip` | 早期入口脚本 / 配置归档 | — |

**总计 13 GB / 131,210 文件。**

---

## 采集口径（这是这套工具链的核心价值）

### 视角定义（全站统一）

| 代号 | 含义 | 引擎参数 |
|---|---|---|
| **F1** | 主驾正视前排 IP | `IPDRV`，h = 后排车头 **+15°**，v = 25，fov = 95 |
| **R1** | 二排正视前排 | `IPFRONT`，h = 后排车头，v = 15，fov = 95 |
| **D1** | 主驾看副驾门 | h = 后排车头 **+57°**，v = 30，fov = 95；出炉后固定裁切成 16:10 |

> 三个视角的标定集中在 `config/p1-calibration.json`，跨车统一；改视角只动这一个文件。

出图统一 **2880×1428**；依据 = `docs/视角规范_LHD副驾侧车外3-4.md`。

### 命名规则（DDGS 口径）

```
IMG_{brandCode}_{modelCode}_{genCode}_{view}_{SUBID=NA}_{AUTO360}_01.png
```

品牌码为 3 字母（如 `TOY`/`HON`/`NIS`/`LEX`…），由 `probe/run_*_ddgs_rename.cjs` 系列脚本统一执行。

### 去重口径

**同 panoId = 同造型** → 一个 panoId 只产出一组图，避免同造型重复计数。

---

## 常用命令

```bash
cd ~/WorkBuddy/数据抓取

# 发现某区域的可采集车型（生成 targets）
node probe/discover.cjs

# 采集（krpano 引擎，确定性角度模型）
node probe/run-p0.cjs          # P0 探测
node probe/run-p1.cjs          # P1 正式采集

# 角度标定
node probe/calibrate.cjs

# 图像质检 / 视角核验
node probe/qc_check.cjs
python3 probe/audit_images_by_view.py

# 采集台账速查（623 车 / 85 品牌）
python3 -c "import csv,collections;r=list(csv.DictReader(open('output/captured_cars.csv',encoding='utf-8-sig')));print(len(r),collections.Counter(x['region'] for x in r))"
```

---

## 与主项目的关系

```
   玩具车? 不 —— 真实链路是：
   ~/WorkBuddy/数据抓取/          （本工具链，13 GB）
            │  机器采：360° 全景 F1/R1
            ▼
   DDGS_内饰设计决策系统/DDGS_数据仓库/   （素材仓）
            │  人采：四大拆解字段级证据图
            ▼
   DDGS for EVA/  （主战场：EES 录入 → 字典 → V12）
```

- **为什么刻意放在项目根之外**：它是「采集工具」，验收标准是**采集覆盖率 / 命名正确率**；而 DDGS 子项目的验收标准是**交付物**。两者不同维，混在一起会让项目边界糊掉（判据见主仓 `PROJECT_INDEX.md` §四）。
- **但它不该是「无身份」的**：所以在 `~/WorkBuddy/DDGS_内饰设计决策系统/DDGS for EVA/PROJECT_INDEX.md` 里被登记为**外部依赖**，并配本目录的 `STATUS.md`。

---

## ⚠️ 三条硬约定

1. **绝不真删** —— 项目内 / 本目录文件一律移入 `~/.Trash/DDGS_清理_<日期>/` 并附还原清单。这套目录已实际救回多次误删。
2. **按目录名批量匹配会误伤真资产** —— 例如 `_extracted/`、`_ppt_export/` 看着像中间产物，实际含**无法一条命令重建**的图。**删除前逐目录确认内容，别信目录名。**
3. **13 GB 不进 git** —— 图本体走 MD5 清单保护（见 `DDGS_数据仓库/MANIFEST_md5.csv`），**不入 git ≠ 不受保护**。

---

> **换机器先读**：本目录 → `STATUS.md`
> **跨仓总索引**：`~/WorkBuddy/DDGS_内饰设计决策系统/DDGS for EVA/PROJECT_INDEX.md`

---

## 🚀 新机器快速开始（复制粘贴版）

这套工具链**不依赖任何本机绝对路径**，克隆到任意机器按下面三步即可跑起来。

### ① 装依赖

```bash
# 需要 Node >= 18
node -v

# Node 依赖（采集主流程只需要这个）
npm install

# Python 依赖（可选，只有跑图像辅助脚本才需要）
pip3 install -r requirements.txt
```

### ② 确认浏览器

脚本默认用 macOS 的 Chrome：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。
若 Chrome 装在别处，或用的是 Windows / Linux，设一个环境变量即可：

```bash
# macOS 默认安装可跳过这一步
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Windows 示例
# set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

# Linux 示例
# export CHROME_PATH="/usr/bin/google-chrome"
```

### ③ 跑采集（F1 / R1 / D1 三视角）

```bash
# 1) 建车型清单（以日系为例；美系/欧系用 build:us / build:eu）
npm run build:jp

# 2) 采集三个视角（--fast-scene 跳过逐机位挑选，快约 3 倍）
node probe/run-p1.cjs --views F1,R1,D1 --fast-scene

# 只补某几台车（逗号分隔 panoId，已采过的会自动跳过）
node probe/run-p1.cjs --views F1,R1,D1 --only-pano "78335,75550" --fast-scene

# 强制重采（忽略已完成记录）
node probe/run-p1.cjs --views F1,R1,D1 --only-pano "78335" --no-skip
```

产物落在 `output/images_by_view/` 下，按视角分目录，每台车带一个同名 `.json` 存来源与角度参数。

### 常用可选参数

| 参数 | 作用 |
|---|---|
| `--views F1,R1,D1` | 指定要抓的视角（默认 F1,R1） |
| `--only-pano <id,id>` | 只跑这几台车 |
| `--fast-scene` | 跳过逐机位挑选，直接取首个匹配机位（推荐） |
| `--no-skip` | 忽略已完成记录，强制重采 |
| `--max N` | 最多跑 N 台 |
| `--shard i/N` | 分片并行（起 N 个进程各跑一片） |

### ⚠️ 两点须知

1. **`output/` 不入 git**（12 GB）。新机器刚克隆时该目录是空的，属正常。
2. **部分车天生缺视角**：双座跑车/超跑（法拉利、兰博基尼、迈凯伦等）**源站没有后排机位**，R1 拍不到；个别车只有后排机位，F1/D1 拍不到。这是数据源限制，不是采集失败——详见 `docs/` 下的各系采集报告。

---

## 本仓库说明（GitHub 发布版）

本仓为 360° 全景采集工具链的**代码与文档**发布版：`probe/`（脚本本体）+ `config/`（车型名单与配置）+ `docs/`（口径与结论）。

- 运行产物（图、台账、缓存，约 12 GB）**不在仓内**，留在工作机走 MD5 清单保护
- `probe/*.log` 运行日志已剥离（含本机路径，非资产）
- 姊妹仓 [autohome-capture](https://github.com/jiaweilicht-prog/autohome-capture) 是另一条线——图片库「副驾侧 3/4 视角」的抓取+判定工具链（含 HANDOFF.md 交接文档）
