// utils/role.js
// 角色与能力判定。权威字段是登录响应的 user.role_name / user.role_id 与顶层 permissions；
// 后端从不返回 user.role，也从不返回 user.isAdmin / user.is_admin。
// 权威字段缺失（本次改动前建立的旧会话）时，管理员判定允许退回历史线索，见 isAdminUser。
const { getUser, getPermissions } = require('./auth');

const ROLE_ADMIN = 'admin';
const ROLE_TEACHER = 'teacher';
const ROLE_STUDENT = 'student';
// roles.id 常量（后端 ROLE_IDS）
const ROLE_ID_NAMES = { 1: ROLE_ADMIN, 2: ROLE_TEACHER, 3: ROLE_STUDENT };
// 教师工作台（只读分析）依赖的后端门禁权限位
const WORKSPACE_PERM = 'grade:read';

function roleNameOf(user) {
  if (!user) return '';
  var fromName = String(user.role_name || user.roleName || '').toLowerCase();
  if (fromName) return fromName;
  var id = Number(user.role_id != null ? user.role_id : user.roleId);
  return ROLE_ID_NAMES[id] || '';
}

// 后端权限集可由管理员改写，通配展开语义与 requirePermission 一致
function hasPermission(perms, required) {
  if (!Array.isArray(perms)) return false;
  if (perms.indexOf('*') >= 0) return true;
  var domain = String(required).split(':')[0];
  return perms.indexOf(required) >= 0 || perms.indexOf(domain + ':*') >= 0;
}

function currentRole(user) {
  return roleNameOf(user || getUser());
}

function isStudent(user) {
  return currentRole(user) === ROLE_STUDENT;
}

// 旧会话 / 旧接口里可能只剩历史线索（isAdmin、role、role_display_name）
function legacyAdminHint(u) {
  if (u.isAdmin === true || u.is_admin === true) return true;
  var legacy = String(u.role || u.roleCode || u.role_code || '').toLowerCase();
  if (legacy === 'admin' || legacy === 'administrator') return true;
  return String(u.role_display_name || '').indexOf('管理员') >= 0;
}

// 前端唯一的管理员判据：权威字段存在时只认 role_name / role_id；
// 完全读不到权威字段（本次改动前建立的会话）才退回历史线索，
// 否则管理员升级后会同时失去「天梯管理」和「教师工作台」两个入口。
// 入口放行不等于有数据：真实边界仍是后端 grade:read / 管理端接口鉴权。
function isAdminUser(user) {
  var u = user || getUser();
  if (!u) return false;
  var role = roleNameOf(u);
  if (role) return role === ROLE_ADMIN;
  return legacyAdminHint(u);
}

// 教师工作台入口：admin 与 teacher 可达，学生与未知角色一律不可见。
// teacher 还要实际持有 grade:read —— 读不到 permissions（旧会话 / 后端未返回该字段，
// 即 list 不是数组）时先放行入口，真实鉴权仍由后端执行，接口 403 时页面显示后端文案；
// 后端明确返回空数组（一个权限位都没有）则隐藏入口，避免点进去只看到 403。
function canViewTeacherWorkspace(user, perms) {
  var role = currentRole(user);
  if (role === ROLE_TEACHER) {
    var list = (perms === undefined || perms === null) ? getPermissions() : perms;
    if (!Array.isArray(list)) return true;
    return hasPermission(list, WORKSPACE_PERM);
  }
  // 读不到权威字段（旧会话）时管理员退回历史线索，与学生/未知角色的拒绝互不干扰
  return role === ROLE_ADMIN || (role === '' && isAdminUser(user));
}

// 教师本人任教学段（subject_teacher / head_teacher / grade_leader），仅用于文案展示
function teacherRoleLabel(user) {
  var u = user || getUser();
  return (u && u.teacher_role) || '';
}

// 「我的」页眉标：沿用各页 `CODE · 中文` 的写法，但这段文字随角色变化，
// 所以判据仍走 roleNameOf（role_name 优先，只有 role_id 的旧响应也能判定），
// 管理员复用前端唯一判据 isAdminUser，页面只消费文案、不再各写一套。
// 后端新增角色时按学生文案回落：本页默认受众是学生，认不出角色只是叫不准，
// 不该因此留空或报错。
const PROFILE_EYEBROWS = {
  student: 'STUDENT · 学生档案',
  teacher: 'TEACHER · 老师档案',
  admin: 'ADMIN · 管理员档案'
};

function profileEyebrow(user) {
  var r = currentRole(user);
  if (r === ROLE_TEACHER) return PROFILE_EYEBROWS.teacher;
  if (r === ROLE_ADMIN || (r === '' && isAdminUser(user))) return PROFILE_EYEBROWS.admin;
  return PROFILE_EYEBROWS.student;
}

// 登录/静默登录后的落地页：教师与管理员进工作台，学生进成绩页
function homePath(user, perms) {
  return canViewTeacherWorkspace(user, perms) ? '/pages/t-exams/t-exams' : '/pages/scores/scores';
}

// 教师工作台页面的准入守卫：不合规直接送回成绩页并返回 false。
// 后端对 /api/analysis/* 另有一道 grade:read 门禁，这里只是不让学生看见入口与页面。
function guardWorkspace() {
  if (canViewTeacherWorkspace()) return true;
  wx.reLaunch({ url: '/pages/scores/scores' });
  return false;
}

module.exports = {
  ROLE_ADMIN: ROLE_ADMIN,
  ROLE_TEACHER: ROLE_TEACHER,
  ROLE_STUDENT: ROLE_STUDENT,
  WORKSPACE_PERM: WORKSPACE_PERM,
  roleNameOf: roleNameOf,
  hasPermission: hasPermission,
  currentRole: currentRole,
  isStudent: isStudent,
  isAdminUser: isAdminUser,
  canViewTeacherWorkspace: canViewTeacherWorkspace,
  teacherRoleLabel: teacherRoleLabel,
  profileEyebrow: profileEyebrow,
  homePath: homePath,
  guardWorkspace: guardWorkspace
};
