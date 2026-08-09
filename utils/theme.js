// utils/theme.js
// 皮肤 / 主题 统一工具，对齐 Project-X main 仓库契约。
// 存储键严格沿用：projectx-skin（持久）/ projectx-skin-chosen（显式选择标记，小程序合并进 storage）/
//                 projectx-theme（明暗）/ projectx-skin-onboarded（一次性引导标志，方案 B 不使用）。
// 默认皮肤 = paper-edge（纸锋），与 X-exam 现状一致；明澈 flat 与暗色为新增可切换维度。

const SKIN_KEY = 'projectx-skin';
const SKIN_CHOSEN_KEY = 'projectx-skin-chosen';
const THEME_KEY = 'projectx-theme';
const ONBOARDED_KEY = 'projectx-skin-onboarded';

const DEFAULT_SKIN = 'paper-edge';
const DEFAULT_THEME = 'light';

const SKIN_OPTIONS = [
  { id: 'paper-edge', name: '纸锋', desc: '纸感米底 · 墨字 · 亮蓝' },
  { id: 'flat', name: '明澈', desc: '白底 · 绯红 · 柔和阴影' }
];

const THEME_OPTIONS = [
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' }
];

// canvas / JS 侧令牌镜像（仿 main 仓库 theme.ts SKIN_TOKENS）
// 仅含图表与关键强调色，随皮肤/主题切换，供 trends/subjects 的 canvas 取色。
function chartTokens(skin, theme) {
  const dark = theme === 'dark';
  if (skin === 'flat') {
    return {
      brand: '#C00F28',
      accent: '#C00F28',
      success: '#16A34A',
      warning: '#D97706',
      danger: '#C00F28',
      grid: dark ? '#2E2E2B' : '#E4E4E7',
      axis: dark ? '#8A887F' : '#52525B',
      chart: dark
        ? ['#F28393', '#8A887F', '#9DB0FF', '#F1EFE9', '#B8B5AB', '#5C5C55', '#2E2E2B', '#1D1D1B']
        : ['#C00F28', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#71717A']
    };
  }
  // paper-edge（默认）
  return {
    brand: '#2E44FF',
    accent: '#2E44FF',
    success: '#2E44FF',
    warning: '#1A1917',
    danger: '#C00F28',
    grid: dark ? '#2E2E2B' : '#D8D5CB',
    axis: dark ? '#8A887F' : '#4A4842',
    chart: dark
      ? ['#4A5CFF', '#8A887F', '#F28393', '#F1EFE9', '#B8B5AB', '#5C5C55', '#2E2E2B', '#1D1D1B']
      : ['#2E44FF', '#8B887E', '#C00F28', '#1A1917', '#4A4842', '#B8B5AB', '#D8D5CB', '#E9E6DE']
  };
}

function getSkin() {
  try { return wx.getStorageSync(SKIN_KEY) || DEFAULT_SKIN; } catch (e) { return DEFAULT_SKIN; }
}

function setSkin(skin) {
  try { wx.setStorageSync(SKIN_KEY, skin); } catch (e) {}
  try { wx.setStorageSync(SKIN_CHOSEN_KEY, skin); } catch (e) {} // 会话显式选择标记（小程序合并入 storage）
}

function getTheme() {
  try { return wx.getStorageSync(THEME_KEY) || DEFAULT_THEME; } catch (e) { return DEFAULT_THEME; }
}

function setTheme(theme) {
  try { wx.setStorageSync(THEME_KEY, theme); } catch (e) {}
}

function markOnboarded() {
  try { wx.setStorageSync(ONBOARDED_KEY, '1'); } catch (e) {}
}

function shouldOnboard() {
  try { return wx.getStorageSync(ONBOARDED_KEY) !== '1'; } catch (e) { return true; }
}

// 供页面在 onShow/onLoad 调用：将当前 skin/theme 写入页面 data，驱动根容器 data-skin/data-theme
function syncPage(page) {
  const app = getApp();
  if (!app || !app.globalData) return;
  page.setData({ skin: app.globalData.skin, theme: app.globalData.theme });
}

module.exports = {
  SKIN_KEY, THEME_KEY, SKIN_CHOSEN_KEY, ONBOARDED_KEY,
  DEFAULT_SKIN, DEFAULT_THEME,
  SKIN_OPTIONS, THEME_OPTIONS,
  chartTokens,
  getSkin, setSkin, getTheme, setTheme,
  markOnboarded, shouldOnboard,
  syncPage
};
