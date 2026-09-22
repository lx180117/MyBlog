import type { UploadedImageDto } from '~/types/api';
import { errorText, notifyError, notifyOk } from '~/utils/dialog';

/**
 * 图片上传（POST /me/upload/image）。
 *
 * 编辑器的正文配图和封面图都用它。抽出来的原因很实际：
 * 两处都要处理 FormData、都要在失败时把后端的错误文案透出来、
 * 都要防止用户在上传中重复点击。
 *
 * 注意：**不做前端的大小/类型白名单拦截**，只拦空文件。
 * 后端会用扩展名 + MIME + 文件头魔数三道校验，而且上限是可配置的
 * （UPLOAD_MAX_SIZE）。前端写死一个 5MB 在部署调大上限之后就会变成
 * 「明明能传却被前端拦住」，把权威判断留给后端。
 */
export function useImageUpload() {
  const api = useApi();
  const uploading = ref(false);

  async function upload(file: File | null | undefined): Promise<UploadedImageDto | null> {
    if (!file) {
      notifyError('没有选择文件');
      return null;
    }
    if (file.size === 0) {
      notifyError('文件是空的');
      return null;
    }

    uploading.value = true;
    try {
      const fd = new FormData();
      // 字段名必须是 file，与后端 FileInterceptor('file') 对齐
      fd.append('file', file);
      return await api.post<UploadedImageDto>('/me/upload/image', fd);
    } catch (e) {
      notifyError(errorText(e, '图片上传失败'));
      return null;
    } finally {
      uploading.value = false;
    }
  }

  /** 选择文件 → 上传 → 成功后的提示语。返回结果给调用方继续处理。 */
  async function pickAndUpload(
    file: File | null | undefined,
    successMessage = '图片已上传',
  ): Promise<UploadedImageDto | null> {
    const res = await upload(file);
    if (res) notifyOk(successMessage);
    return res;
  }

  return { uploading, upload, pickAndUpload };
}
