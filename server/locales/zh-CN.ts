import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  media: {
    error: {
      typeNotAllowed:
        '不支持该文件类型。请上传图片、音频、视频、PDF、文本或 Markdown 文件。',
      mimeNotAllowed: '出于安全原因，不支持该文件类型。',
      tooLarge: '文件超过了 {{maxMb}} MB 的上限。',
      invalidFile: '请选择要上传的文件。',
      notFound: '未找到该素材。',
      forbidden: '你没有执行该操作的权限。',
      fileNotFound: '未找到上传的文件。',
      fileAlreadyLinked: '该文件已在素材库中。',
      invalidName: '名称不能为空。',
      invalidStatus: '不支持该状态。',
      uploadFailed: '上传失败，请重试。',
    },
  },
};

export default zhCN;
