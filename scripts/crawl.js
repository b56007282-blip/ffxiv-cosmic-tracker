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
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

// 爬取国服数据（最新接口适配版）
async function crawlCN() {
  try {
    // 最新有效接口（根据抓包结果）
    const apiUrl = 'https://ff14act.web.sdo.com/api/cosmicData/getCosmicData';
    
    // 构造请求头（完全模拟浏览器请求）
    const requestHeaders = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Connection': 'keep-alive',
      'Host': 'ff14act.web.sdo.com',
      'Origin': 'https://actff1.web.sdo.com',
      'Referer': 'https://actff1.web.sdo.com/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    };

    // 发送GET请求并添加时间戳避免缓存
    const res = await axios.get(apiUrl, {
      headers: requestHeaders,
      timeout: 15000,
      params: {
        t: new Date().getTime() // 时间戳参数防止304缓存
      }
    });

    // 验证接口响应
    if (!res.data) {
      console.error('国服接口无返回数据');
      return [];
    }
    if (res.data.code !== 10000) { // 接口成功状态码为10000
      console.error('国服接口返回错误:', `Code=${res.data.code}, Message=${res.data.msg}`);
      return [];
    }
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      console.error('国服数据格式错误: 数据列表为空或不是数组');
      return [];
    }

    // 解析服务器数据（根据实际返回字段映射）
    const servers = [];
    res.data.data.forEach(item => {
      servers.push({
        region: item.area_name || '国服', // 大区名称（如"陆行鸟"、"莫古力"）
        server: item.group_name || '未知服务器', // 服务器名称（如"拉诺西亚"、"神拳痕"）
        progress: Math.min(Math.round(item.ProgressRate / 10), 100), // 进度率转换为百分比（ProgressRate/10）
        level: parseInt(item.DevelopmentGrade || 0), // 开发等级（对应原level字段）
        lastUpdate: item.data_time || moment().format('YYYY-MM-DD HH:mm:ss'), // 数据更新时间
        source: 'cn',
        timestamp: new Date().toISOString()
      });
    });

    console.log(`国服成功爬取 ${servers.length} 条数据`);
    return servers;
  } catch (err) {
    console.error('国服爬取失败:', err.message);
    // 输出详细错误信息用于调试
    if (err.response) {
      console.error('响应状态码:', err.response.status);
      console.error('响应体:', err.response.data);
      console.error('响应头:', err.response.headers);
    }
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
    // 明确定义filePath变量
    const timestamp = moment().format('YYYY-MM-DD-HH-mm');
    const filePath = path.join(historyDir, `${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
    // 这里使用的变量名与定义完全一致
    console.log(`成功保存 ${allData.length} 条数据至 ${filePath}`);
  } else {
    console.log('未获取到任何有效数据');
  }
}

// 执行主函数
main();
