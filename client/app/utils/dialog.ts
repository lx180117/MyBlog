import { ElMessage, ElMessageBox } from 'element-plus';

/**
 * 后台的交互反馈封装。
 *
 * 直接 import Element Plus 的 imperative API（而不是靠自动导入）：
 * 这里要的是**确定的行为** —— ElMessage / ElMessageBox 是函数调用而不是组件，
 * 一旦没被自动导入，问题会推迟到运行时才炸（"ElMessage is not defined"），
 * 显式导入让类型检查就能拦住。
 */

/** 危险操作二次确认。用户确认返回 true，取消（含 ESC / 点遮罩）返回 false。 */
export async function confirmDanger(
  message: string,
  options: { title?: string; confirmText?: string } = {},
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, options.title ?? '请确认', {
      type: 'warning',
      confirmButtonText: options.confirmText ?? '确定',
      cancelButtonText: '取消',
      // 危险动作用红色确认按钮，避免手快点过去
      confirmButtonClass: 'el-button--danger',
    });
    return true;
  } catch {
    return false;
  }
}

export function notifyOk(message: string): void {
  ElMessage.success(message);
}

export function notifyError(message: string): void {
  ElMessage.error(message);
}

/**
 * 单行文本输入弹窗。用户取消返回 null（与「输入了空字符串」区分开 ——
 * 重置密码那里空字符串是有意义的：「留空则服务端随机生成」）。
 */
export async function promptText(
  message: string,
  title: string,
  placeholder = '',
): Promise<string | null> {
  try {
    const res = await ElMessageBox.prompt(message, title, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: placeholder,
      inputValue: '',
    });
    return res.value ?? '';
  } catch {
    return null;
  }
}

/** 纯告知型弹窗（用来展示一次性可见的信息，比如重置后的临时密码） */
export async function alertText(
  message: string,
  title: string,
  confirmText = '知道了',
): Promise<void> {
  try {
    // 不用 dangerouslyUseHTMLString：临时密码、用户名这类内容直接当文本渲染，
    // 少一个 XSS 注入面
    await ElMessageBox.alert(message, title, { confirmButtonText: confirmText });
  } catch {
    /* 关闭 */
  }
}

/**
 * 从异常里取一句可直接展示的话。
 * ApiError.message 已经是后端给的中文（含参数校验信息），直接用即可。
 */
export function errorText(e: unknown, fallback = '操作失败'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** 把 ISO 时间转成 <input type="datetime-local"> 需要的本地时间字符串 */
export function toLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
