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

// 爬取国服数据（匹配最新接口）
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
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': 'SNDA_ADRefererSystem_MachineTicket=16020117-20ae-4779-9ce5-d0a7bad0ca93; _ga=GA1.2.335017158.1739280420; userinfo=userid=525090039-1248945546-1757806413&siteid=SDG-08132-01; hasAdsr=1; exp_ff14=s%3AGiF5Bxa4S8X9EqQuET-hyDqyFc1LpoiT.xOJFkwhN5uKB%2BAqH6AVsqopz7ikPnDbYQCbHcGqmYk0; NSC_MC-IE-gg14bdu.xfc.tep.dpn-I80=ffffffff09884eaa45525d5f4f58455e445a4a423660; __wftflow=110058305=1; RT=ul=1762615376328&r=https%3A%2F%2Factff1.web.sdo.com%2Fproject%2F20250619cosmicexploration%2Fv4kjfz92uewnum597r5wr0fa3km7bg%2Findex.html&hd=1762615376559',
      'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };

    const res = await axios.get(apiUrl, {
      headers: requestHeaders,
      timeout: 15000,
      params: { t: new Date().getTime() },
      withCredentials: true
    });

    if (!res.data) {
      console.error('国服接口无返回数据');
      return [];
    }
    if (res.data.code !== 10000) {
      console.error('国服接口返回错误:', `Code=${res.data.code}, Message=${res.data.msg || '无信息'}`);
      return [];
    }
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      console.error('国服数据格式错误: 列表为空或非数组');
      return [];
    }

    // 解析数据（根据实际规则：ProgressRate / 10 = 百分比）
    const servers = [];
    res.data.data.forEach(item => {
      // 核心修复：将ProgressRate除以10得到正确百分比（如875 → 87.5%）
      const rawProgress = parseInt(item.ProgressRate || 0);
      const progress = Math.min(Math.max(rawProgress / 10, 0), 100); // 限制范围0-100

      servers.push({
        region: item.area_name || '国服',
        server: item.group_name || '未知服务器',
        progress: progress, // 保留一位小数（如87.5）
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
    }
    return [];
  }
}

// 爬取国际服数据
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

      if (naDCs.includes(dcTitle)) region = '国际服-北美';
      else if (euDCs.includes(dcTitle)) region = '国际服-欧洲';
      else if (ocDCs.includes(dcTitle)) region = '国际服-大洋洲';
      else if (jpDCs.includes(dcTitle)) region = '国际服-日本';
      else region = '国际服-未知区域';

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

// 获取上一次的历史数据（仅服务器数据，过滤元信息）
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
      // 过滤掉进度变化元数据，只保留服务器数据（source字段标识服务器数据）
      return Array.isArray(lastData) ? lastData.filter(item => item.source) : [];
    }
  } catch (err) {
    console.error('读取历史数据失败:', err.message);
  }
  return [];
}

// 主函数（核心修复）
async function main() {
  // 1. 爬取当前数据
  const [cnData, naData] = await Promise.all([crawlCN(), crawlNA()]);
  const currentData = [...cnData, ...naData];

  if (currentData.length === 0) {
    console.log('未获取到任何有效数据');
    return;
  }

  // 2. 获取上一次数据（干净的服务器数据）
  const lastData = getLastHistoryData();

  // 3. 计算当前周期的进度变化（彻底重新计算，不依赖任何缓存）
  const progressChanges = [];
  currentData.forEach(current => {
    // 生成唯一标识：region + server（如"国服-猫小胖-摩杜纳"）
    const currentId = `${current.region}-${current.server}`;
    
    // 查找上一次数据中相同的服务器
    const last = lastData.find(item => `${item.region}-${item.server}` === currentId);
    
    // 仅记录当前周期的变化
    if (last && last.progress !== current.progress) {
      progressChanges.push({
        serverId: currentId,
        oldProgress: last.progress,
        newProgress: current.progress,
        changeTime: new Date().toISOString()
      });
    }
  });

  // 4. 构造最终数据（当前变化 + 最新服务器数据）
  const finalData = [
    { 
      type: 'progress_changes', 
      count: progressChanges.length,
      changes: progressChanges.map(c => c.serverId), // 仅保留服务器标识
      timestamp: new Date().toISOString()
    },
    ...currentData
  ];

  // 5. 保存新文件（文件名含时间戳，确保唯一性）
  const timestamp = moment().format('YYYY-MM-DD-HH-mm');
  const filePath = path.join(historyDir, `${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2));
  
  // 输出结果
  console.log(`成功保存 ${currentData.length} 条数据至 ${filePath}`);
  if (progressChanges.length > 0) {
    console.log(`当前周期进度变化的服务器: ${progressChanges.map(c => c.serverId).join(', ')}`);
  } else {
    console.log('当前周期无服务器进度变化');
  }
}

// 执行主函数
main();
