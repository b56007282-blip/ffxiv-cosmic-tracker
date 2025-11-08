const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// 确保数据目录存在
const historyDir = path.join(__dirname, '../data/history');
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

// 请求头配置
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

// 爬取国服数据
async function crawlCN() {
  try {
    const res = await axios.get('https://actff1.web.sdo.com/project/20250619cosmicexploration/v4kjfz92uewnum597r5wr0fa3km7bg/index.html#/cosmic_exploration/report/', {
      headers,
      timeout: 15000
    });
    const $ = cheerio.load(res.data);
    const servers = [];

    // 实际选择器可能需要根据页面结构调整
    $('.server-list .server-item').each((i, el) => {
      const region = $(el).find('.area-name').text().trim() || '国服';
      const name = $(el).find('.server-name').text().trim();
      const progressText = $(el).find('.progress-rate').text().trim();
      const progress = progressText ? parseInt(progressText.replace('%', '')) : 0;
      const level = parseInt($(el).find('.level-num').text().trim() || 0);
      const lastUpdate = $(el).find('.update-time').text().trim() || moment().format('YYYY-MM-DD HH:mm');

      if (name) {
        servers.push({
          region,
          server: name,
          progress,
          level,
          lastUpdate,
          source: 'cn',
          timestamp: new Date().toISOString()
        });
      }
    });
    return servers;
  } catch (err) {
    console.error('国服爬取失败:', err.message);
    return [];
  }
}

// 爬取国际服数据
async function crawlNA() {
  try {
    const res = await axios.get('https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/', {
      headers,
      timeout: 15000
    });
    const $ = cheerio.load(res.data);
    const servers = [];

    // 实际选择器可能需要根据页面结构调整
    $('.world_table .world_row').each((i, el) => {
      const region = '国际服';
      const name = $(el).find('.world_name').text().trim();
      const progressText = $(el).find('.progress_value').text().trim();
      const progress = progressText ? parseInt(progressText) : 0;
      const level = parseInt($(el).find('.level_text').text().replace('Level', '').trim() || 0);
      const lastUpdate = $(el).find('.update_time').text().trim() || moment().format('YYYY-MM-DD HH:mm');

      if (name) {
        servers.push({
          region,
          server: name,
          progress,
          level,
          lastUpdate,
          source: 'na',
          timestamp: new Date().toISOString()
        });
      }
    });
    return servers;
  } catch (err) {
    console.error('国际服爬取失败:', err.message);
    return [];
  }
}

// 主函数
async function main() {
  const [cnData, naData] = await Promise.all([crawlCN(), crawlNA()]);
  const allData = [...cnData, ...naData];

  if (allData.length > 0) {
    const timestamp = moment().format('YYYY-MM-DD-HH-mm');
    const filePath = path.join(historyDir, `${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
    console.log(`成功保存 ${allData.length} 条数据至 ${filePath}`);
  } else {
    console.log('未获取到任何有效数据');
  }
}

main();
