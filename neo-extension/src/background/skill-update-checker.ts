/**
 * 技能更新检查服务
 * 在后台 Service Worker 中定期检查技能更新并自动下载
 */

const BACKEND_URL = 'http://localhost:3000';

// 更新检查间隔（分钟）
const CHECK_INTERVAL_MINUTES = 30;
const ALARM_NAME = 'skill-update-check';

export interface SkillUpdateInfo {
  id: string;
  hasUpdate: boolean;
  latestVersion?: number;
  name?: string;
}

/**
 * 获取所有已安装的技能列表（从缓存中）
 */
async function getInstalledSkills(): Promise<Array<{ id: string; version: number }>> {
  try {
    const allItems = await chrome.storage.local.get(null);
    const installedSkills: Array<{ id: string; version: number }> = [];

    for (const [key, value] of Object.entries(allItems)) {
      if (key.startsWith('skill_')) {
        const skillId = key.replace('skill_', '');
        const cached = value as { code: string; version: number; cachedAt: number };
        installedSkills.push({
          id: skillId,
          version: cached.version,
        });
      }
    }

    return installedSkills;
  } catch (error) {
    console.error('[Neo] Error getting installed skills:', error);
    return [];
  }
}

/**
 * 批量检查技能更新
 */
async function checkSkillUpdatesBatch(
  skillVersions: Array<{ id: string; version: number }>
): Promise<SkillUpdateInfo[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/skills/check-updates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ skillIds: skillVersions }),
    });

    if (!response.ok) {
      throw new Error(`Failed to check updates: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('[Neo] Error checking skill updates:', error);
    return [];
  }
}

/**
 * 下载技能定义
 */
async function downloadSkill(skillId: string): Promise<string> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/skills/${skillId}/download`);
    if (!response.ok) {
      throw new Error(`Failed to download skill: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('[Neo] Error downloading skill:', error);
    throw error;
  }
}

/**
 * 缓存技能到本地存储
 */
async function cacheSkill(skillId: string, code: string, version: number): Promise<void> {
  const key = `skill_${skillId}`;
  const data = {
    code,
    version,
    cachedAt: Date.now(),
  };
  
  await chrome.storage.local.set({ [key]: data });
}

/**
 * 更新技能到最新版本
 */
async function updateSkill(skillId: string): Promise<boolean> {
  try {
    // 下载最新版本
    const code = await downloadSkill(skillId);
    
    // 获取版本信息
    const response = await fetch(`${BACKEND_URL}/api/skills/${skillId}`);
    if (response.ok) {
      const data = await response.json();
      const version = data.data?.version || 1;
      await cacheSkill(skillId, code, version);
      
      console.log(`[Neo] Skill ${skillId} updated to version ${version}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[Neo] Error updating skill ${skillId}:`, error);
    return false;
  }
}

/**
 * 检查并更新所有技能
 */
export async function checkAndUpdateSkills(): Promise<void> {
  try {
    console.log('[Neo] Starting skill update check...');
    
    // 获取所有已安装的技能
    const installedSkills = await getInstalledSkills();
    
    if (installedSkills.length === 0) {
      console.log('[Neo] No installed skills found');
      return;
    }
    
    console.log(`[Neo] Found ${installedSkills.length} installed skills`);
    
    // 批量检查更新
    const updates = await checkSkillUpdatesBatch(installedSkills);
    
    // 筛选出有更新的技能
    const skillsToUpdate = updates.filter(u => u.hasUpdate);
    
    if (skillsToUpdate.length === 0) {
      console.log('[Neo] No skill updates available');
      return;
    }
    
    console.log(`[Neo] Found ${skillsToUpdate.length} skills with updates`);
    
    // 更新所有有更新的技能
    for (const updateInfo of skillsToUpdate) {
      const success = await updateSkill(updateInfo.id);
      if (success) {
        console.log(`[Neo] Successfully updated skill: ${updateInfo.name || updateInfo.id}`);
        
        // 发送更新通知（可选）
        // 可以通过 chrome.notifications API 或消息传递给 content script
        chrome.runtime.sendMessage({
          type: 'SKILL_UPDATED',
          data: {
            skillId: updateInfo.id,
            skillName: updateInfo.name,
            newVersion: updateInfo.latestVersion,
          },
        }).catch(() => {
          // 忽略消息发送失败（可能没有 content script 监听）
        });
      }
    }
    
    console.log('[Neo] Skill update check completed');
  } catch (error) {
    console.error('[Neo] Error in skill update check:', error);
  }
}

/**
 * 设置定期更新检查
 */
export function setupUpdateChecker(): void {
  // 清除现有的 alarm（如果存在）
  chrome.alarms.clear(ALARM_NAME);
  
  // 创建新的 alarm，每 30 分钟检查一次
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });
  
  console.log(`[Neo] Skill update checker scheduled (every ${CHECK_INTERVAL_MINUTES} minutes)`);
  
  // 监听 alarm 事件
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      checkAndUpdateSkills();
    }
  });
  
  // 立即执行一次检查（延迟 5 秒，等待 Service Worker 完全启动）
  setTimeout(() => {
    checkAndUpdateSkills();
  }, 5000);
}

