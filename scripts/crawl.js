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

// 爬取国服数据（最新修复版）
async function crawlCN() {
  try {
    // 重新验证的有效接口（2025年11月最新）
    const apiUrl = 'https://actff1.web.sdo.com/api/Project/LoadModuleData';
    
    // 构造正确的请求参数（关键修复点）
    const postData = {
      projectId: '20250619cosmicexploration',
      moduleId: 'v4kjfz92uewnum597r5wr0fa3km7bg',
      extendParams: JSON.stringify({
        type: 'report',
        t: new Date().getTime() // 添加时间戳避免缓存
      })
    };

    // 完善请求头
    const requestHeaders = {
      ...headers,
      'Content-Type': 'application/json',
      'Referer': 'https://actff1.web.sdo.com/project/20250619cosmicexploration/v4kjfz92uewnum597r5wr0fa3km7bg/index.html',
      'Origin': 'https://actff1.web.sdo.com',
      'X-Requested-With': 'XMLHttpRequest' // 模拟AJAX请求
    };

    const res = await axios.post(apiUrl, postData, {
      headers: requestHeaders,
      timeout: 15000
    });

    // 详细的响应验证
    if (!res.data) {
      console.error('国服接口无返回数据');
      return [];
    }
    if (res.data.Code !== 0) {
      console.error('国服接口返回错误:', `Code=${res.data.Code}, Message=${res.data.Message}`);
      return [];
    }
    if (!res.data.Data || !res.data.Data.ServerList) {
      console.error('国服数据格式错误:', '未找到ServerList');
      return [];
    }

    // 解析服务器数据
    const servers = [];
    const { AreaList, ServerList } = res.data.Data;

    ServerList.forEach(server => {
      const area = AreaList?.find(a => a.AreaId === server.AreaId) || { AreaName: '国服' };
      servers.push({
        region: area.AreaName,
        server: server.ServerName || '未知服务器',
        progress: parseInt(server.Progress || 0),
        level: parseInt(server.Level || 0),
        lastUpdate: server.UpdateTime || moment().format('YYYY-MM-DD HH:mm:ss'),
        source: 'cn',
        timestamp: new Date().toISOString()
      });
    });

    console.log(`国服成功爬取 ${servers.length} 条数据`);
    return servers;
  } catch (err) {
    console.error('国服爬取失败:', err.message);
    // 输出完整错误信息用于调试
    if (err.response) {
      console.error('响应状态码:', err.response.status);
      console.error('响应头:', err.response.headers);
      console.error('响应体:', err.response.data);
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
