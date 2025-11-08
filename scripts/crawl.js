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
    // 请替换为真实国服URL（从HTML推测的正确路径）
    const url = 'https://actff1.web.sdo.com/project/20250619cosmicexploration/v4kjfz92uewnum597r5wr0fa3km7bg/index.html#/cosmic_exploration/report/';
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://xxx.finalfantasyxiv.com/' // 增加Referer模拟正常访问
    };

    const res = await axios.get(url, { headers, timeout: 20000 });

    if (!res.data) {
      console.error('国服无响应数据');
      return [];
    }

    const $ = cheerio.load(res.data);
    const servers = [];

    // 关键修复：先定位数据中心容器，再找到内部的服务器列表容器（cosmic__report__world）
    $('.cosmic__report__dc').each((dcIndex, dcEl) => {
      const dcTitle = $(dcEl).find('.cosmic__report__dc__title').text().trim() || '未知数据中心';
      
      // 服务器卡片被包裹在.cosmic__report__world中，必须先定位这个容器
      const worldContainer = $(dcEl).find('.cosmic__report__world');
      if (worldContainer.length === 0) {
        console.debug(`数据中心${dcTitle}未找到服务器列表容器`);
        return;
      }

      // 从服务器列表容器中提取所有卡片（包含completed特殊卡片）
      worldContainer.find('.cosmic__report__card').each((cardIndex, cardEl) => {
        // 1. 提取服务器名称（严格匹配HTML中的结构）
        const serverName = $(cardEl).find('.cosmic__report__card__name p').text().trim();
        if (!serverName) {
          console.debug(`数据中心${dcTitle}存在无名称卡片，跳过`);
          return;
        }

        // 2. 计算进度（8等份，兼容特殊完成状态卡片）
        let progress = 0;
        const isCompleted = $(cardEl).hasClass('completed');
        if (isCompleted) {
          progress = 100;
        } else {
          // 进度条在.cosmic__report__status__progress__bar中
          const progressBar = $(cardEl).find('.cosmic__report__status__progress__bar');
          const gaugeClass = progressBar.attr('class') || '';
          const gaugeMatch = gaugeClass.match(/gauge-(\d+)/);
          
          if (gaugeMatch) {
            const gaugeLevel = parseInt(gaugeMatch[1], 10);
            progress = Math.round((gaugeLevel / 8) * 100 * 10) / 10; // 如gauge-7 → 87.5
          } else {
            console.debug(`服务器${serverName}未找到进度条，进度设为0`);
          }
        }

        // 3. 提取等级（直接从HTML的等级标签获取）
        const levelText = $(cardEl).find('.cosmic__report__grade__level p').text().trim();
        const level = parseInt(levelText || 0);
        if (level === 0 && levelText) {
          console.debug(`服务器${serverName}等级提取失败，原始文本: ${levelText}`);
        }

        // 4. 组装数据
        servers.push({
          region: '国服',
          server: serverName,
          dc: dcTitle,
          progress,
          level,
          lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss'),
          source: 'cn',
          timestamp: new Date().toISOString()
        });
      });
    });

    // 结果验证与调试
    if (servers.length === 0) {
      console.error('爬取0条数据，可能原因：');
      console.error('1. 服务器列表容器选择器错误（当前用.cosmic__report__world）');
      console.error('2. 页面存在反爬，可尝试添加Cookie');
      console.error('3. URL错误（请确认国服实际地址）');
    } else {
      console.log(`国服成功爬取 ${servers.length} 条数据`);
    }
    return servers;
  } catch (err) {
    console.error('国服爬取失败:', err.message);
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

      // 提取进度状态（8等份计算）
      let progress = 0;
      const isCompleted = $(el).hasClass('completed');
      if (isCompleted) {
        progress = 100; // 已完成服务器进度为100%
      } else {
        const progressBar = $(el).find('.cosmic__report__status__progress__bar');
        const gaugeClass = progressBar.attr('class') || '';
        const gaugeMatch = gaugeClass.match(/gauge-(\d+)/);
        
        if (gaugeMatch) {
          const gaugeLevel = parseInt(gaugeMatch[1], 10);
          progress = Math.round((gaugeLevel / 8) * 100 * 10) / 10; // 保留一位小数
        }
      }

      // 提取等级（直接从网页获取）
      const levelText = $(el).find('.cosmic__report__grade__level p').text().trim();
      const level = parseInt(levelText || 0);

      // 提取数据中心
      const dcTitle = $(el).closest('.cosmic__report__dc').find('.cosmic__report__dc__title').text().trim();

      // 根据dc映射region（核心修正）
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
        region = '国际服-未知区域'; // 兼容异常情况
      }

      servers.push({
        region,
        server: serverName,
        dc: dcTitle,
        progress,
        level,
        // 移除status字段（需求1）
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
