const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// 确保数据目录存在
const historyDir = path.join(__dirname, '../data/history');
const progressChangesPath = path.join(__dirname, '../data/progress_changes.json'); // 新增：progress_changes存储路径
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

// 新增：清空progress_changes数据的函数
function clearProgressChanges() {
  try {
    // 写入空数组清空文件
    fs.writeFileSync(progressChangesPath, '[]', 'utf8');
    console.log('✅ 已清空progress_changes数据');
  } catch (err) {
    // 若文件不存在则创建空文件
    if (err.code === 'ENOENT') {
      fs.writeFileSync(progressChangesPath, '[]', 'utf8');
      console.log('✅ 已创建并清空progress_changes文件');
    } else {
      console.error('❌ 清空progress_changes失败:', err.message);
    }
  }
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
    const apiUrl = 'https://ff14act.web.sdo.com/api/cosmicData/getCosmicData';
    
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

    const res = await axios.get(apiUrl, {
      headers: requestHeaders,
      timeout: 15000,
      params: {
        t: new Date().getTime()
      }
    });

    if (!res.data) {
      console.error('国服接口无返回数据');
      return [];
    }
    if (res.data.code !== 10000) {
      console.error('国服接口返回错误:', `Code=${res.data.code}, Message=${res.data.msg}`);
      return [];
    }
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      console.error('国服数据格式错误: 数据列表为空或不是数组');
      return [];
    }

    // 修正：国服进度改为8等份计算（与国际服统一）
    const servers = [];
    res.data.data.forEach(item => {
      // 假设接口返回的ProgressRate对应gauge等级（1-8），转换为8等份百分比
      const gaugeLevel = parseInt(item.ProgressRate || 0);
      const progress = gaugeLevel > 0 
        ? Math.round((gaugeLevel / 8) * 100 * 10) / 10 
        : 0;

      servers.push({
        region: item.area_name || '国服',
        server: item.group_name || '未知服务器',
        progress: Math.min(progress, 100), // 确保不超过100%
        level: parseInt(item.DevelopmentGrade || 0),
        lastUpdate: item.data_time || moment().format('YYYY-MM-DD HH:mm:ss'),
        source: 'cn',
        timestamp: new Date().toISOString()
      });
    });

    console.log(`国服成功爬取 ${servers.length} 条数据`);
    return servers;
  } catch (err) {
    console.error('国服爬取失败:', err.message);
    if (err.response) {
      console.error('响应状态码:', err.response.status);
      console.error('响应体:', err.response.data);
      console.error('响应头:', err.response.headers);
    }
    return [];
  }
}

// 爬取国际服数据（修正进度计算）
async function crawlNA() {
  try {
    const url = 'https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/';
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive'
    };

    const res = await axios.get(url, { headers, timeout: 20000 });

    if (!res.data) {
      console.error('国际服无响应数据');
      return [];
    }

    const $ = cheerio.load(res.data);
    const servers = [];

    $('.cosmic__report__card').each((i, el) => {
      const serverName = $(el).find('.cosmic__report__card__name p').text().trim();
      if (!serverName) return;

      let progress = 0;
      const isCompleted = $(el).hasClass('completed');
      if (isCompleted) {
        progress = 100;
      } else {
        const progressBar = $(el).find('.cosmic__report__status__progress__bar');
        const gaugeClass = progressBar.attr('class') || '';
        const gaugeMatch = gaugeClass.match(/gauge-(\d+)/);
        
        if (gaugeMatch) {
          const gaugeLevel = parseInt(gaugeMatch[1], 10);
          progress = Math.round((gaugeLevel / 8) * 100 * 10) / 10;
        }
      }

      const levelText = $(el).find('.cosmic__report__grade__level p').text().trim();
      const level = parseInt(levelText || 0);

      const dcTitle = $(el).closest('.cosmic__report__dc').find('.cosmic__report__dc__title').text().trim();

      let region;
      const naDCs = ['Aether', 'Crystal', 'Dynamis', 'Primal'];
      const euDCs = ['Chaos', 'Light'];
      const ocDCs = ['Materia'];
      const jpDCs = ['Elemental', 'Gaia', 'Mana', 'Meteor'];

      if (naDCs.includes(dcTitle)) {
        region = '国际服-北美';
      } else if (euDCs.includes(dcTitle)) {
        region = '国际服-欧洲';
      } else if (ocDCs.includes(dcTitle)) {
        region = '国际服-大洋洲';
      } else if (jpDCs.includes(dcTitle)) {
        region = '国际服-日本';
      } else {
        region = '国际服-未知区域';
      }

      servers.push({
        region,
        server: serverName,
        dc: dcTitle,
        progress,
        level,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss'),
        source: 'na',
        timestamp: new Date().toISOString()
      });
    });

    console.log(`国际服成功爬取 ${servers.length} 条数据`);
    return servers;
  } catch (err) {
    console.error('国际服爬取失败:', err.message);
    return [];
  }
}

// 获取上一次的历史数据
function getLastHistoryData() {
  try {
    const files = fs.readdirSync(historyDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        name: file,
        time: new Date(file.replace('.json', '').replace(/-/g, ' '))
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      const lastFile = files[0].name;
      const lastFilePath = path.join(historyDir, lastFile);
      const lastData = JSON.parse(fs.readFileSync(lastFilePath, 'utf8'));
      // 过滤掉progress_changes元数据，只保留服务器数据
      return Array.isArray(lastData) ? lastData.filter(item => item.source) : [];
    }
  } catch (err) {
    console.error('读取历史数据失败:', err.message);
  }
  return [];
}

// 主函数（核心修改）
async function main() {
  // 关键：生成新文件前先清空progress_changes
  clearProgressChanges();

  const [cnData, naData] = await Promise.all([crawlCN(), crawlNA()]);
  const currentData = [...cnData, ...naData];

  if (currentData.length > 0) {
    const lastData = getLastHistoryData();

    // 生成当前周期的progress_changes（仅包含本次变化）
    const progressChanges = [];
    currentData.forEach(current => {
      const last = lastData.find(item => 
        item.region === current.region && item.server === current.server
      );
      if (last && last.progress !== current.progress) {
        progressChanges.push({
          server: `${current.region}-${current.server}`,
          oldProgress: last.progress,
          newProgress: current.progress,
          changeTime: new Date().toISOString()
        });
      }
    });

    // 保存本次progress_changes到独立文件
    fs.writeFileSync(progressChangesPath, JSON.stringify(progressChanges, null, 2));

    // 构造最终数据（包含本次变化记录）
    const finalData = [
      { 
        type: 'progress_changes', 
        count: progressChanges.length,
        timestamp: new Date().toISOString()
      },
      ...currentData
    ];

    const timestamp = moment().format('YYYY-MM-DD-HH-mm');
    const filePath = path.join(historyDir, `${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2));
    console.log(`成功保存 ${currentData.length} 条数据至 ${filePath}`);
    if (progressChanges.length > 0) {
      console.log(`进度有变化的服务器: ${progressChanges.map(c => c.server).join(', ')}`);
    } else {
      console.log('无服务器进度变化');
    }
  } else {
    console.log('未获取到任何有效数据');
  }
}

// 执行主函数
main();
