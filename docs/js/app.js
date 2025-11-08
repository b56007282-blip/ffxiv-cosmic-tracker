document.addEventListener('DOMContentLoaded', async () => {
  // 替换为你的GitHub用户名和仓库名
  const GITHUB_USER = 'b56007282-blip';
  const REPO_NAME = 'ffxiv-cosmic-tracker';

  try {
    // 获取所有历史数据文件
    const fileUrls = await getHistoryFileUrls(GITHUB_USER, REPO_NAME);
    
    if (fileUrls.length === 0) {
      showMessage('暂无数据，请等待首次爬取完成（约30分钟）');
      return;
    }

    // 加载并处理数据
    const allData = await loadAllData(fileUrls);
    const sortedData = sortDataByTime(allData);
    const servers = getUniqueServers(sortedData);

    // 初始化界面
    initFilters(servers);
    initServerTabs(servers);
    renderServerData(servers[0], sortedData);
    addEventListeners(servers, sortedData);

  } catch (err) {
    showMessage(`加载失败: ${err.message}`);
    console.error(err);
  }
});

// 获取历史数据文件URL列表
async function getHistoryFileUrls(user, repo) {
  const url = `https://api.github.com/repos/${user}/${repo}/contents/data/history`;
  const res = await fetch(url);
  
  if (!res.ok) throw new Error('数据目录不存在');
  
  const files = await res.json();
  return files
    .filter(f => f.name.endsWith('.json'))
    .map(f => f.download_url)
    .sort((a, b) => {
      const dateA = new Date(a.split('/').pop().replace('.json', ''));
      const dateB = new Date(b.split('/').pop().replace('.json', ''));
      return dateA - dateB;
    });
}

// 加载所有数据
async function loadAllData(fileUrls) {
  const allData = [];
  for (const url of fileUrls) {
    const res = await fetch(url);
    const data = await res.json();
    allData.push(...data);
  }
  return allData;
}

// 按时间排序数据
function sortDataByTime(data) {
  return [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// 获取唯一服务器列表
function getUniqueServers(data) {
  const serverMap = new Map();
  data.forEach(item => {
    const key = `${item.region}-${item.server}`;
    if (!serverMap.has(key)) serverMap.set(key, item);
  });
  return Array.from(serverMap.values()).sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    return a.server.localeCompare(b.server);
  });
}

// 初始化筛选器
function initFilters(servers) {
  const serverFilter = document.getElementById('server-filter');
  servers.forEach(server => {
    const option = document.createElement('option');
    option.value = `${server.region}-${server.server}`;
    option.textContent = `${server.region} - ${server.server}`;
    serverFilter.appendChild(option);
  });
}

// 初始化服务器标签
function initServerTabs(servers) {
  const container = document.querySelector('.server-tabs');
  servers.forEach(server => {
    const tab = document.createElement('div');
    tab.className = 'server-tab';
    tab.dataset.id = `${server.region}-${server.server}`;
    tab.textContent = server.server;
    container.appendChild(tab);
  });
  container.firstChild?.classList.add('active');
}

// 渲染服务器数据
function renderServerData(server, allData) {
  const serverId = `${server.region}-${server.server}`;
  const serverData = allData.filter(item => `${item.region}-${item.server}` === serverId);
  
  renderCurrentStatus(serverData[serverData.length - 1]);
  renderHistoryChart(serverData);
}

// 渲染当前状态
function renderCurrentStatus(data) {
  const card = document.querySelector('.status-card');
  card.innerHTML = `
    <div class="status-item">
      <h3>大区</h3>
      <div class="value">${data.region}</div>
    </div>
    <div class="status-item">
      <h3>服务器</h3>
      <div class="value">${data.server}</div>
    </div>
    <div class="status-item">
      <h3>重建等级</h3>
      <div class="value">${data.level}</div>
    </div>
    <div class="status-item">
      <h3>进度</h3>
      <div class="value">${data.progress}%</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${data.progress}%"></div>
      </div>
    </div>
    <div class="status-item">
      <h3>数据更新时间</h3>
      <div class="value">${new Date(data.timestamp).toLocaleString()}</div>
    </div>
  `;
}

// 渲染历史图表
function renderHistoryChart(data) {
  const ctx = document.getElementById('progress-chart').getContext('2d');
  
  // 准备数据
  const labels = data.map(item => new Date(item.timestamp).toLocaleString());
  const progress = data.map(item => item.progress);
  const levels = data.map(item => item.level);
  
  // 销毁旧图表
  if (window.progressChart) window.progressChart.destroy();
  
  // 创建新图表
  window.progressChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '进度 (%)',
          data: progress,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          fill: true,
          tension: 0.2,
          yAxisID: 'y'
        },
        {
          label: '重建等级',
          data: levels,
          borderColor: '#e74c3c',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '进度 (%)' },
          min: 0,
          max: 100
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: '等级' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

// 添加事件监听
function addEventListeners(servers, allData) {
  // 服务器标签点击
  document.querySelectorAll('.server-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.server-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const server = servers.find(s => `${s.region}-${s.server}` === tab.dataset.id);
      if (server) renderServerData(server, allData);
    });
  });

  // 大区筛选
  document.getElementById('region-filter').addEventListener('change', e => {
    const region = e.target.value;
    document.querySelectorAll('.server-tab').forEach(tab => {
      const [tabRegion] = tab.dataset.id.split('-');
      tab.style.display = region === 'all' || tabRegion === region ? 'block' : 'none';
    });
    
    const firstVisible = document.querySelector('.server-tab:not([style="display: none;"])');
    if (firstVisible) firstVisible.click();
  });

  // 服务器筛选
  document.getElementById('server-filter').addEventListener('change', e => {
    if (e.target.value === 'all') return;
    const tab = document.querySelector(`.server-tab[data-id="${e.target.value}"]`);
    if (tab) {
      tab.click();
      tab.scrollIntoView({ behavior: 'smooth', inline: 'start' });
    }
  });
}

// 显示提示信息
function showMessage(text) {
  document.querySelector('.server-data').innerHTML = `<p style="text-align:center;padding:20px;">${text}</p>`;
}
