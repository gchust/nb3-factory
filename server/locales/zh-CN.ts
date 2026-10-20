import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  helpdesk: {
    notifications: {
      subject: '{{ticketNo}} · {{title}}',
      assigned: '工单已分配：{{ticketNo}}',
      started: '工单处理中：{{ticketNo}}',
      resolved: '工单已解决：{{ticketNo}}',
      reopened: '工单已重新打开：{{ticketNo}}',
      closed: '工单已关闭：{{ticketNo}}',
      cancelled: '工单已取消：{{ticketNo}}',
      escalated: '工单已超时：{{ticketNo}}',
    },
    permissionSets: {
      employee: '员工',
      supportEngineer: '支持工程师',
      serviceDesk: '服务台',
    },
    errors: {
      authenticationRequired: '请登录后继续。',
      authorizationDenied: '当前账号无权执行此操作。',
      ticketNotFound: '未找到工单 {{ticketId}}。',
      transitionRefused: '工单无法流转到该状态。',
      createFailed: '工单未创建。',
      attachmentFailed: '附件未添加。',
      titleAndDescriptionRequired: '标题和描述为必填项。',
      unknownCategory: '请选择有效的工单分类。',
      unknownPriority: '请选择有效的工单优先级。',
      attachmentUnavailable: '一个或多个附件不可用。',
      commentRequired: '评论内容为必填项。',
      fileNotFound: '未找到文件。',
      workflowExecutionNotFound: '未找到工作流执行记录 {{recordId}}。',
      workflowNotFound: '未找到工作流 {{workflowName}}。',
    },
    workflow: {
      definitionTitle: '工单',
    },
    lifecycle: {
      guards: {
        requesterMismatch: '只能为当前登录的申请人创建工单。',
        engineerRequired: '只有支持工程师可以领取待处理工单。',
        alreadyAssigned: '此工单已被分配。',
        serviceDeskAssign: '只有服务台可以分配工单。',
        engineerSelected: '必须选择一名工程师。',
        assigneeOrServiceDeskStart:
          '只有已分配的工程师或服务台可以开始处理此工单。',
        assigneeOrServiceDeskResolve: '只有处理人或服务台可以解决此工单。',
        resolutionRequired: '解决方案为必填项。',
        requesterReopen: '只有申请人或服务台可以重新打开此工单。',
        requesterClose: '只有申请人或管理员可以关闭此已解决的工单。',
        serviceDeskCancel: '只有服务台可以取消工单。',
        cancelReasonRequired: '取消原因为必填项。',
        systemEscalate: '超时升级由服务器执行。',
        systemTouch: '活动时间由服务器维护。',
      },
    },
  },
};

export default zhCN;
