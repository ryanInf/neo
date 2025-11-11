/**
 * UI 注入模块
 * 在页面中注入技能按钮和工具栏
 */

import { getSkillList, getSkill } from './skill-manager';
import { executeSkill, executeApiCallInPage } from './skill-executor';
import { logExecution } from './log-collector';

interface SkillButton {
  id: string;
  name: string;
  description: string;
}

/**
 * 创建技能按钮容器
 */
function createSkillContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'neo-skill-container';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    min-width: 250px;
    max-height: 400px;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  return container;
}

/**
 * 创建技能按钮
 */
function createSkillButton(skill: SkillButton): HTMLElement {
  const button = document.createElement('button');
  button.textContent = skill.name;
  button.title = skill.description;
  button.style.cssText = `
    display: block;
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 8px;
    text-align: left;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  
  button.addEventListener('click', async () => {
    await executeSkillInPage(skill.id);
  });
  
  return button;
}

/**
 * 执行技能
 */
async function executeSkillInPage(skillId: string): Promise<void> {
  try {
    // 获取技能代码
    const code = await getSkill(skillId);
    
    // 获取当前域名
    const domain = window.location.hostname;
    
    // 创建执行结果容器
    const resultContainer = document.createElement('div');
    resultContainer.id = 'neo-skill-result';
    resultContainer.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000000;
      background: white;
      border: 2px solid #007bff;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      max-width: 500px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    resultContainer.innerHTML = `
      <h3 style="margin-top: 0;">执行中...</h3>
      <div id="neo-skill-progress"></div>
    `;
    
    document.body.appendChild(resultContainer);
    
    // 执行技能
    const result = await executeSkill(
      code,
      domain,
      executeApiCallInPage,
      (step) => {
        const progressDiv = document.getElementById('neo-skill-progress');
        if (progressDiv) {
          const retryInfo = step.retryCount && step.retryCount > 0 
            ? ` <span style="color: orange;">(重试 ${step.retryCount} 次)</span>` 
            : '';
          progressDiv.innerHTML += `
            <div style="margin-top: 8px;">
              <strong>步骤 ${step.order + 1}:</strong> ${step.status === 'success' ? '✓' : '✗'} ${step.apiCallId}${retryInfo}
            </div>
          `;
        }
      }
    );
    
    // 记录执行日志
    // 获取技能版本信息
    const skillInfo = await fetch(`http://localhost:3000/api/skills/${skillId}`).then(r => r.json());
    const skillVersion = skillInfo.data?.version || 1;
    logExecution(skillId, skillVersion, domain, result);
    
    // 显示结果
    const progressDiv = document.getElementById('neo-skill-progress');
    if (progressDiv) {
      progressDiv.innerHTML = `
        <h4>${result.success ? '执行成功' : '执行失败'}</h4>
        ${result.error ? `<p style="color: red;">${result.error}</p>` : ''}
        ${result.steps ? `
          <div style="margin-top: 12px;">
            <strong>执行步骤:</strong>
            ${result.steps.map(s => {
              const retryInfo = s.retryCount && s.retryCount > 0 
                ? ` <span style="color: orange;">(重试 ${s.retryCount} 次)</span>` 
                : '';
              const retryDetails = s.retryAttempts && s.retryAttempts.length > 0
                ? `<div style="margin-left: 20px; font-size: 12px; color: #666;">
                    ${s.retryAttempts.map(ra => `  重试 ${ra.attempt}: ${ra.error} (${ra.duration}ms)`).join('<br>')}
                  </div>`
                : '';
              return `
              <div style="margin-top: 4px;">
                ${s.status === 'success' ? '✓' : '✗'} ${s.apiCallId} (${s.duration}ms)${retryInfo}
                ${retryDetails}
              </div>
            `;
            }).join('')}
          </div>
        ` : ''}
        <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 16px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          关闭
        </button>
      `;
    }
  } catch (error) {
    console.error('[Neo] Error executing skill:', error);
    alert(`执行技能失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 提取主域名（去除 www 等子域名前缀）
 */
function getMainDomain(hostname: string): string {
  // 移除 www. 前缀
  let domain = hostname.replace(/^www\./, '');
  
  // 提取主域名（例如：www.xiaohongshu.com -> xiaohongshu.com）
  // 对于常见的二级域名，保留完整域名
  const parts = domain.split('.');
  if (parts.length >= 2) {
    // 取最后两部分作为主域名（例如：xiaohongshu.com）
    domain = parts.slice(-2).join('.');
  }
  
  return domain;
}

/**
 * 注入技能 UI
 */
export async function injectSkillUI(): Promise<void> {
  // 检查是否已经注入
  if (document.getElementById('neo-skill-container')) {
    return;
  }
  
  const hostname = window.location.hostname;
  const mainDomain = getMainDomain(hostname);
  
  console.log('[Neo] Current hostname:', hostname);
  console.log('[Neo] Main domain:', mainDomain);
  
  // 获取技能列表（使用主域名）
  const skills = await getSkillList(mainDomain);
  
  console.log('[Neo] Found skills:', skills.length);
  
  if (skills.length === 0) {
    console.log('[Neo] No skills available for this domain');
    return;
  }
  
  // 创建容器
  const container = createSkillContainer();
  
  // 添加标题
  const title = document.createElement('h3');
  title.textContent = 'Neo 技能';
  title.style.cssText = 'margin-top: 0; margin-bottom: 12px; font-size: 16px;';
  container.appendChild(title);
  
  // 添加技能按钮
  skills.forEach(skill => {
    const button = createSkillButton({
      id: skill.id,
      name: skill.name,
      description: skill.description,
    });
    container.appendChild(button);
  });
  
  // 添加到页面
  document.body.appendChild(container);
  
  console.log('[Neo] Skill UI injected');
}

// 页面加载完成后注入 UI
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectSkillUI);
} else {
  injectSkillUI();
}

