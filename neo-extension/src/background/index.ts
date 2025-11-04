// Service Worker 后台脚本
// 处理来自 content script 的消息和批量上报

import { setupUpdateChecker } from './skill-update-checker';

console.log('[Neo] Background service worker loaded');

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'API_CAPTURE') {
    // 这里可以添加额外的处理逻辑
    console.log('[Neo] Received API capture:', message.data);
  }
  
  if (message.type === 'SKILL_UPDATED') {
    // 处理技能更新通知（可以在这里添加通知逻辑）
    console.log('[Neo] Skill updated:', message.data);
  }
  
  return true;
});

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Neo] Extension installed/updated:', details.reason);
  
  // 设置技能更新检查器
  setupUpdateChecker();
});

// Service Worker 启动时也设置更新检查器
setupUpdateChecker();

