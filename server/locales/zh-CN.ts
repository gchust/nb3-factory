import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  sales: {
    errors: {
      customerNameRequired: '客户名称不能为空。',
      customerNotFound: '客户不存在。',
      customerHasRelatedRecords: '该客户仍有联系人或商机，请先删除后再试。',
      contactNameRequired: '联系人姓名不能为空。',
      contactCustomerRequired: '请为该联系人选择所属客户。',
      contactNotFound: '联系人不存在。',
      opportunityNameRequired: '商机名称不能为空。',
      opportunityCustomerRequired: '请为该商机选择所属客户。',
      opportunityNotFound: '商机不存在。',
      invalidAmount: '预计金额不能为负数。',
      invalidStage: '所选阶段不存在。',
      invalidId: '请求的记录不存在。',
      invalidBody: '请求体必须是 JSON 对象。',
    },
  },
};

export default zhCN;
