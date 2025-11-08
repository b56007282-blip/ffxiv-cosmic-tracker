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

// 请求头配置（保持不变）
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

    // 遍历所有服务器卡片
    $('.cosmic__report__card').each((i, el) => {
      // 提取服务器名称
      const serverName = $(el).find('.cosmic__report__card__name p').text().trim();
      if (!serverName) return;

      // 提取进度状态（核心修正：8等份计算）
      let progress = 0;
      const isCompleted = $(el).hasClass('completed');
      if (isCompleted) {
        progress = 100; // 已完成服务器进度为100%
      } else {
        // 从进度条类名提取gauge等级（如gauge-7）
        const progressBar = $(el).find('.cosmic__report__status__progress__bar');
        const gaugeClass = progressBar.attr('class') || '';
        const gaugeMatch = gaugeClass.match(/gauge-(\d+)/);
        
        if (gaugeMatch) {
          const gaugeLevel = parseInt(gaugeMatch[1], 10);
          // 关键修正：8等份 → 等级÷8×100（如7÷8=87.5%）
          progress = Math.round((gaugeLevel / 8) * 100 * 10) / 10; // 保留一位小数
        }
      }

      // 提取等级
      const levelText = $(el).find('.cosmic__report__grade__level p').text().trim();
      const level = parseInt(levelText || 0);

      // 提取数据中心
      const dcTitle = $(el).closest('.cosmic__report__dc').find('.cosmic__report__dc__title').text().trim();

      // 提取区域
      let region = '国际服';
      const activeRegionTab = $('.cosmic__report__tab .active').text().trim();
      if (activeRegionTab) {
        region = `国际服-${activeRegionTab}`;
      }

      servers.push({
        region,
        server: serverName,
        dc: dcTitle,
        progress, // 修正后的值（如87.5%）
        level,
        status: isCompleted ? 'completed' : 'in_progress',
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

// 新增：获取上一次的历史数据
function getLastHistoryData() {
  try {
    // 读取history目录下所有JSON文件
    const files = fs.readdirSync(historyDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        name: file,
        time: new Date(file.replace('.json', '').replace(/-/g, ' ')) // 解析文件名中的时间
      }))
      .sort((a, b) => b.time - a.time); // 按时间倒序排序

    // 如果有历史文件，读取最新的一个
    if (files.length > 0) {
      const lastFile = files[0].name;
      const lastFilePath = path.join(historyDir, lastFile);
      const lastData = JSON.parse(fs.readFileSync(lastFilePath, 'utf8'));
      // 过滤掉可能的元数据（只保留服务器数据）
      return Array.isArray(lastData) ? lastData : [];
    }
  } catch (err) {
    console.error('读取历史数据失败:', err.message);
  }
  return []; // 无历史数据时返回空数组
}

// 主函数（修改部分）
async function main() {
  const [cnData, naData] = await Promise.all([crawlCN(), crawlNA()]);
  const currentData = [...cnData, ...naData];

  if (currentData.length > 0) {
    // 1. 获取上一次的历史数据
    const lastData = getLastHistoryData();

    // 2. 对比当前数据与上一次数据，找出进度变化的服务器
    const progressChanges = [];
    currentData.forEach(current => {
      // 匹配上一次数据中相同的服务器（region + server 唯一标识）
      const last = lastData.find(item => 
        item.region === current.region && item.server === current.server
      );
      // 若存在历史记录且进度不同，记录变化
      if (last && last.progress !== current.progress) {
        progressChanges.push(`${current.region}-${current.server}`);
      }
    });

    // 3. 构造最终数据：头部添加变化记录，后续跟完整服务器数据
    const finalData = [
      { 
        type: 'progress_changes', 
        count: progressChanges.length,
        servers: progressChanges,
        timestamp: new Date().toISOString()
      },
      ...currentData // 完整服务器数据
    ];

    // 4. 保存文件
    const timestamp = moment().format('YYYY-MM-DD-HH-mm');
    const filePath = path.join(historyDir, `${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2));
    console.log(`成功保存 ${currentData.length} 条数据至 ${filePath}`);
    if (progressChanges.length > 0) {
      console.log(`进度有变化的服务器: ${progressChanges.join(', ')}`);
    } else {
      console.log('无服务器进度变化');
    }
  } else {
    console.log('未获取到任何有效数据');
  }
}

// 执行主函数
main();
