// utils/role.js
// 角色与能力判定。权威字段是登录响应的 user.role_name / user.role_id 与顶层 permissions；
// 后端从不返回 user.role，也从不返回 user.isAdmin / user.is_admin。
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

// 教师工作台入口：admin 与 teacher 可达，学生与未知角色一律不可见。
// teacher 还要实际持有 grade:read —— 缺少 permissions（本次改动前建立的旧会话）时
// 先放行入口，真实鉴权仍由后端执行，接口 403 时页面显示后端文案。
function canViewTeacherWorkspace(user, perms) {
  var role = currentRole(user);
  if (role === ROLE_ADMIN) return true;
  if (role !== ROLE_TEACHER) return false;
  var list = perms || getPermissions();
  if (!Array.isArray(list) || list.length === 0) return true;
  return hasPermission(list, WORKSPACE_PERM);
}

// 教师本人任教学段（subject_teacher / head_teacher / grade_leader），仅用于文案展示
function teacherRoleLabel(user) {
  var u = user || getUser();
  return (u && u.teacher_role) || '';
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
  canViewTeacherWorkspace: canViewTeacherWorkspace,
  teacherRoleLabel: teacherRoleLabel,
  homePath: homePath,
  guardWorkspace: guardWorkspace
};
