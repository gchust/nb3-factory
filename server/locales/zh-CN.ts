import type { LocaleResource } from '@nocobase/i18n';

const zhCN = {
  tickets: {
    authorization: {
      resource: '服务工单',
      section: '服务台',
      actions: {
        view: '查看工单',
        create: '创建工单',
        comment: '工单评论',
        commentInternal: '填写内部备注',
        attach: '上传附件',
        download: '下载附件',
        accept: '受理并分配',
        assign: '分派给工程师',
        resolve: '解决工单',
        close: '确认并关闭',
        reopen: '退回继续处理',
      },
      scopes: {
        ownTickets: '本人创建的工单',
        ownComments: '本人工单的评论',
        ownScreenshots: '本人工单的附件',
        assignedTickets: '分派给我的工单',
        assignedComments: '分派工单的评论',
        assignedScreenshots: '分派工单的附件',
      },
      collections: {
        tickets: '工单',
        comments: '工单评论',
        screenshots: '工单附件',
      },
    },
    permissionSets: {
      admin: '服务台管理员',
      maintainer: '服务台维护人员',
      requester: '申请人',
    },
  },
};

export type AppServerResource = LocaleResource<typeof zhCN>;

export default zhCN;
