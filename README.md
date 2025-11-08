# FFXIV 宇宙探索进度追踪

自动爬取并展示最终幻想14（FFXIV）国服与国际服的宇宙探索进度数据。

## 功能特点

- 每30分钟自动爬取官方网站数据
- 按服务器分组展示历史进度
- 可视化进度趋势图表
- 支持大区和服务器筛选
- 数据永久存档，可查看历史变化

## 数据来源

- 国服：[盛大游戏活动页]([https://actff1.web.sdo.com/project/20250619cosmicexploration/...](https://actff1.web.sdo.com/project/20250619cosmicexploration/v4kjfz92uewnum597r5wr0fa3km7bg/index.html#/cosmic_exploration/report/))
- 国际服：[Lodestone官方页](https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/)

## 在线预览

访问 [GitHub Pages](https://your-username.github.io/your-repo-name) 查看最新数据。

## 使用说明

1. 点击服务器标签切换不同服务器
2. 使用顶部筛选器按大区/服务器筛选
3. 图表展示进度和等级的历史变化趋势

## 本地部署

1. 克隆本仓库
2. 安装依赖：`cd scripts && npm install`
3. 手动运行爬虫：`node scripts/crawl.js`
4. 打开 `docs/index.html` 查看页面（需先有数据）
