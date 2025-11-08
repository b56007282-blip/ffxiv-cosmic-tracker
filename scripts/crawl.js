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

// 爬取国际服数据（修复响应无法加载问题）
async function crawlNA() {
  try {
    const url = 'https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/';
    
    // 1. 模拟完整浏览器请求头（关键修复）
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    };

    // 2. 发送请求时禁用默认Cookie，避免被识别为自动化工具
    const res = await axios.get(url, {
      headers,
      timeout: 20000,
      withCredentials: false, // 不携带Cookie
      responseType: 'text' // 强制以文本形式接收（避免解析错误）
    });

    // 3. 验证响应是否有效
    if (!res.data || res.data.includes('403 Forbidden') || res.data.includes('Access Denied')) {
      console.error('国际服请求被拦截，响应内容:', res.data.substring(0, 200)); // 打印前200字符调试
      return [];
    }

    // 4. 解析HTML（如果数据是嵌入在页面中的）
    const $ = cheerio.load(res.data);
    const servers = [];

    // 注意：以下选择器需根据实际页面结构调整（关键！）
    // 示例：假设服务器数据在class为"world-entry"的元素中
    $('.world-entry').each((i, el) => {
      const serverName = $(el).find('.world-name').text().trim();
      const progressText = $(el).find('.progress').text().trim().replace('%', '');
      const levelText = $(el).find('.level').text().trim().replace('Level ', '');
      
      if (serverName) {
        servers.push({
          region: '国际服',
          server: serverName,
          progress: parseInt(progressText || 0),
          level: parseInt(levelText || 0),
          lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss'), // 若页面有更新时间可替换
          source: 'na',
          timestamp: new Date().toISOString()
        });
      }
    });

    console.log(`国际服成功爬取 ${servers.length} 条数据`);
    return servers;
  } catch (err) {
    console.error('国际服爬取失败:', err.message);
    if (err.response) {
      console.error('响应状态码:', err.response.status);
      console.error('响应头:', err.response.headers);
    }
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
