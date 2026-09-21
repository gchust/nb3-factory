import { defineSeed } from '@nocobase/db';

/**
 * Business attachments that demonstrate every preview path required by the application: two different images, a
 * three-page PDF, a Chinese UTF-8 TXT, a CSV, and a DOCX that is intentionally not previewed online.
 *
 * Bytes are stored in the database so the seed is deterministic and portable. Idempotent by fixed file id.
 */
export default defineSeed({
  name: '202609210002_compliance_file_samples',
  async run({ query }) {
    const admin = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    const adminId = admin?.id ?? 'system';
    const now = new Date('2026-03-20T08:00:00.000Z');

    const suppliers = await query
      .selectFrom('suppliers')
      .select(['id', 'code', 'organizationId'])
      .execute();
    const supplierByCode = new Map(suppliers.map((row) => [row.code, row]));
    const contracts = await query
      .selectFrom('contracts')
      .select(['id', 'contractNo'])
      .execute();
    const contractByNo = new Map(contracts.map((row) => [row.contractNo, row]));

    const files = [
      {
        id: '11111111-1111-4111-8111-111111111101',
        supplierCode: 'SUP-1001',
        category: 'business_license',
        filename: '华东精密机械-营业执照.png',
        ext: 'png',
        mimeType: 'image/png',
        note: '营业执照扫描件（演示图片一）',
        data: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAASwAAADICAIAAADdvUsCAAAEk0lEQVR42u3dsQ0QMRBFQaqgAGqgHjJKpQtyUgJCkGjhfNg8SzvSFnDjrxffh49fPzvnwvvgCZwToXMidM6J0DkROueuifDnn1/b7/vvH8mdsPDy/ss3NxFaiJe3jNBCvLxlhBbi5S0jtBAvbxmhhXh5ywgtxMtbRmghXt4yQgvx8pYRWoiXt4zQQry8ZYQW4uUtI7QQL28ZoYV4ecsILcTLW0ZoIV7eMkIL8fKWEVqIl7eM0EK8vGWEFuLlLSO0EC9vGaGFeHm3eF9GaCFe3l3eNxFaiJd3o3c5Qgvx8u71rkVoIV7e7d6FCC3Ey3vC+zRCC/HyHvI+itBCvLznvPdGaCHeId5LI7QQ7xzvjRFaiHeU97oILcQ7zXtXhBbiHei9KEIL8c703hKhhXjHeq+I0EK8k719hBbiHe6NI7QQL28ZoYV4ecsILcTLW0ZoIV7eMkIL8fKWEVqIl7eM0EK8vGWEFuLlLSO0EC9vGaGFeHnLCC3Ey1tGaCFe3jJCC/HylhFaiJe3jNBCvLxlhBbi5S0jtBAv75EIP3374pw7dCJ0ToTOiVCEzonQORGK0DkROidCETonQudEKELnROicCEXonAidE6EInROhcyIUoXMidE6EInROhM6JUITOidA5ETrnROicCJ1zInROhM45ETonQuecCJ0bFqF/6/DynvP+vwgtxMtbRmghXt4yQgvx8pYRWoiXt4zQQry8ZYQW4uUtI7QQL28ZoYV4ecsILcTLW0ZoIV7eMkIL8fKWEVqIl7eM0EK8vGWEFuLlLSO0EC9vGaGFeHnLCC3Ey7vF+zJCC/Hy7vK+idBCvLwbvcsRWoiXd693LUIL8fJu9y5EaCFe3hPepxFaiJf3kPdRhBbi5T3nvTdCC/EO8V4aoYV453hvjNBCvKO810VoId5p3rsitBDvQO9FEVqId6b3lggtxDvWe0WEFuKd7O0jtBDvcG8coYV4ecsILcTLW0ZoIV7eMkIL8fKWEVqIl7eM0EK8vGWEFuLlLSO0EC9vGaGFeHnLCC3Ey1tGaCFe3jJCC/HylhFaiJe3jNBCvLxlhBbi5S0jtBAvbxmhhXh5ywgtxMtbRmghXt4yQgvx8pYRWoiXt4zQQry8ZYQW4uUtI7QQL+8W78sILcTLu8v7JkIL8fJu9C5HaCFe3r3etQgtxMu73bsQoYV4eU94n0ZoIV7eQ95HEVqIl/ec994ILcQ7xHtphBbineO9MUIL8Y7yXhehhXinee+K0EK8A70XRWgh3pneWyK0EO9Y7xURWoh3sreP0EK8w71xhBbi5S0jtBAvbxmhhXh5ywgtxMtbRmghXt4yQgvx8pYRWoiXt4zQQry8ZYQW4uUtI7QQL28ZoYV4ecsILcTLW0ZoIV7eMkIL8fKWEVqIl7eM0EK8vGWEFuLlLSO0EC9vGaGFeHnLCC3Ey1tGaCFe3jJCC/HylhFaiJe3jNBCvLxbvC8jtBAv7y7vmwgtxMu70bscoYV4efd61yK0EC/vdu9ChBbi5T3hfRqhhXh5D3kfReic+58nQudE6JwInXMidE6Ezrno/gLEI/m05T4kJQAAAABJRU5ErkJggg==',
          'base64',
        ),
      },
      {
        id: '11111111-1111-4111-8111-111111111102',
        supplierCode: 'SUP-1001',
        category: 'quality_cert',
        filename: '华东精密机械-质量体系认证.pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        note: 'ISO 9001 质量体系认证证书，共 3 页（演示 PDF）',
        data: Buffer.from(
          'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUiA0IDAgUiA1IDAgUl0gL0NvdW50IDMgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvQ29udGVudHMgNiAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvQ29udGVudHMgNyAwIFIgPj4KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA5IDAgUiA+PiA+PiAvQ29udGVudHMgOCAwIFIgPj4KZW5kb2JqCjYgMCBvYmoKPDwgL0xlbmd0aCAzNTcgPj4Kc3RyZWFtCkJUIC9GMSAyMCBUZiA2MCA3NjAgVGQgKFBhZ2UgMSkgVGogRVQKQlQgL0YxIDE2IFRmIDYwIDcwMCBUZCAoUXVhbGl0eSBNYW5hZ2VtZW50IFN5c3RlbSBDZXJ0aWZpY2F0ZSkgVGogRVQKQlQgL0YxIDEyIFRmIDYwIDY2MCBUZCAoQ2VydGlmaWNhdGUgTm86IFFDLTIwMjYtMDAwMSkgVGogRVQKQlQgL0YxIDEyIFRmIDYwIDYzMiBUZCAoSXNzdWVkIHRvOiBIdWFkb25nIFByZWNpc2lvbiBNYWNoaW5lcnkgQ28uLCBMdGQuKSBUaiBFVApCVCAvRjEgMTIgVGYgNjAgNjA0IFRkIChTdGFuZGFyZDogSVNPIDkwMDE6MjAxNSkgVGogRVQKQlQgL0YxIDEyIFRmIDYwIDU3NiBUZCAoVmFsaWQgdW50aWw6IDIwMjctMDYtMzApIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNyAwIG9iago8PCAvTGVuZ3RoIDM0OSA+PgpzdHJlYW0KQlQgL0YxIDIwIFRmIDYwIDc2MCBUZCAoUGFnZSAyKSBUaiBFVApCVCAvRjEgMTYgVGYgNjAgNzAwIFRkIChTY29wZSBvZiBDZXJ0aWZpY2F0aW9uKSBUaiBFVApCVCAvRjEgMTIgVGYgNjAgNjYwIFRkIChEZXNpZ24gYW5kIG1hbnVmYWN0dXJlIG9mIHByZWNpc2lvbikgVGogRVQKQlQgL0YxIDEyIFRmIDYwIDYzMiBUZCAobWVjaGFuaWNhbCBjb21wb25lbnRzIGFuZCBhc3NlbWJsaWVzKSBUaiBFVApCVCAvRjEgMTIgVGYgNjAgNjA0IFRkIChmb3IgaW5kdXN0cmlhbCBhdXRvbWF0aW9uIGVxdWlwbWVudC4pIFRqIEVUCkJUIC9GMSAxMiBUZiA2MCA1NzYgVGQgKEF1ZGl0IGRhdGU6IDIwMjYtMDMtMTIpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKOCAwIG9iago8PCAvTGVuZ3RoIDI5OSA+PgpzdHJlYW0KQlQgL0YxIDIwIFRmIDYwIDc2MCBUZCAoUGFnZSAzKSBUaiBFVApCVCAvRjEgMTYgVGYgNjAgNzAwIFRkIChBdWRpdCBGaW5kaW5ncykgVGogRVQKQlQgL0YxIDEyIFRmIDYwIDY2MCBUZCAoUGFnZSAzIG9mIDMpIFRqIEVUCkJUIC9GMSAxMiBUZiA2MCA2MzIgVGQgKE1ham9yIGZpbmRpbmdzOiAwKSBUaiBFVApCVCAvRjEgMTIgVGYgNjAgNjA0IFRkIChNaW5vciBmaW5kaW5nczogMiBjbG9zZWQpIFRqIEVUCkJUIC9GMSAxMiBUZiA2MCA1NzYgVGQgKE5leHQgc3VydmVpbGxhbmNlIGF1ZGl0OiAyMDI2LTA5LTE1KSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjkgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgMTAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDEyNyAwMDAwMCBuIAowMDAwMDAwMjUzIDAwMDAwIG4gCjAwMDAwMDAzNzkgMDAwMDAgbiAKMDAwMDAwMDUwNSAwMDAwMCBuIAowMDAwMDAwOTEyIDAwMDAwIG4gCjAwMDAwMDEzMTEgMDAwMDAgbiAKMDAwMDAwMTY2MCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDEwIC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgoxNzMwCiUlRU9GCg==',
          'base64',
        ),
      },
      {
        id: '11111111-1111-4111-8111-111111111103',
        supplierCode: 'SUP-1001',
        category: 'bank_info',
        filename: '华东精密机械-银行信息.csv',
        ext: 'csv',
        mimeType: 'text/csv',
        note: '银行账户信息（中文 UTF-8 CSV）',
        data: Buffer.from(
          '5bqP5Y+3LOS+m+W6lOWVhuWQjeensCzlvIDmiLfpk7booYws6ZO26KGM6LSm5Y+3LOW4geenjQoxLOWNjuS4nOeyvuWvhuacuuaisOaciemZkOWFrOWPuCzkuK3lm73lt6XllYbpk7booYzkuIrmtbfliIbooYwsNjIyMjAyMDIwMDAwMTIzNDU2NyxDTlkKMizopb/pg6jljIXoo4XmnInpmZDlhazlj7gs5Lit5Zu95bu66K6+6ZO26KGM5oiQ6YO95YiG6KGMLDYyMjcwMDAwMTIzNDU2Nzg5MDEsQ05ZCg==',
          'base64',
        ),
      },
      {
        id: '11111111-1111-4111-8111-111111111104',
        supplierCode: 'SUP-1002',
        category: 'audit_photo',
        filename: '南方电子元件-现场审核照片.png',
        ext: 'png',
        mimeType: 'image/png',
        note: '现场审核照片（演示图片二）',
        data: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAASwAAADICAIAAADdvUsCAAAEk0lEQVR42u3dvU1rQRCAUSohow96oUBKcCEugYCM0BA4QUI292fHd2fmSJM96XvS7B7pEsA+Pb++G2MOnCcrMAZCYyA0xkBoDITGmGkQfn59D5nT+XI6X0bVlJVrlCFUVoZQWRlCCJWVIVRWhhBCZWUIlZUhhFBZGUJlZQghVFaGUFkZQgiVlSFUVoYQQmVlCJWVIYRQWRlCZWUIIVRWhlBZGUIIlZUhVFaG0KKVlSFUVobQopWVj0J4/c+MMREDoTEZEPrkUFb2M6GyMoQWrawMobIyhBatrAyhsjKEFq2sDKGyMoQWrawMobIyhBatrAyhsjKEFq2sDKGyMoQWrawMobIyhBatrAyhsjKEFq2sDGGv8svbx625lm/9qz1D6Ai3l+/AW45wD0gnCGHH8kJ42xCuBekEIexV3sBvD8IlFJ0ghF3Km/ntR3ifohOEsH55J79RCG9RdIIQVi4P4TcW4V+KThDCmuWB/CIQ/qboBCEsWB4uMAjh1aETPAyhJzuM8SqTMV5l8skxbkI/Gh9T9jnqZ8LE5UdSCS1DCGHK8uOphJYhhDBZ+SgqoWV3A8I05WOphJbdDQgTlGegElp2NyCcujwPldCyuwFhtd9/T4fQ7+xDCCGEEFr0yl8LrIdwj0MIIRxfnplKaNndgHCK8vxUQsvuBoQQQghh70VnoRJadjcghBBCCLsuOheV0LK7ASGEEELYb9EZqYSW3Q0IIYQQwk6LzksltOxuQAghhBD2WHR2Kt57ghBCCCGEEEIIIYQQQggh3FiuQSW0DCGEEEIIIYQQQrgHoSc7jPEqkzFeZfI5OvRbtNvn6L9fpD5HIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEII/aEnf+gJQgghhBBCCCGEEEIIIYRw0jKE3qKAEEIIIYQQQgghhBBCCFsvGkJv1kMIIYR1EXqywxivMhnjVSafo8vG5+jaD1GfoxBCCCGE5coQrhUIIYQQQghhuXJzhO4GhBBCCKFFL3BYFaG7AeFE5YYI3Q0Ipyu3QuhuQAghhBBa9BqHxRC6GxBOXS6P0N2AMEG5MEJ3A8I05ZII3Q0Ik5WLIWx4ghBWKJdB2PYEIaxQLoCw+QlCWKGcGqEThLBUGUJ3A0IIV/zdNCcIYc1yCoROEML65WkROkEIe5WnQugEIexbPhyhE4RQeRfFPQidIITKAyh6OwlCi44q+8OEEFp0hd/Zt+eUCD3ZYYxXmYzxKpNPDmVlPxMqK0No0crKECorQ2jRysoQKitDaNHKyhAqK0No0crKECorQ2jRysoQKitDaNHKyhAqK0No0crKECorQ2jRysoQKitDaNHKyhAqK0No0crKECorQ2jRysoQKitDaNHKyhAqK0No0crKECore5XJGONVJmO8yuSTQ1nZz4TKyhA6QmVlCJWVIXSEysoQKitD6AiVlSFUVobQESorQ6isDKEjVFaGUFk5D0JjzCMHQmMgNAZCYwyExkBojDlofgBMzVVKan7ZyAAAAABJRU5ErkJggg==',
          'base64',
        ),
      },
      {
        id: '11111111-1111-4111-8111-111111111105',
        supplierCode: 'SUP-1003',
        category: 'rectification',
        filename: '北方材料-整改说明.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        note: '整改说明（中文 UTF-8 文本）',
        data: Buffer.from(
          '5pW05pS56YCa55+l5LiO6K+05piOCgrkvpvlupTllYbvvJrljJfmlrnmnZDmlpnnp5HmioDmnInpmZDlhazlj7gK6Zeu6aKY77ya6LWE6LSo6K+B5Lmm5bey6L+H5pyf77yM6ZyA5ZyoIDIwMjYtMTAtMDEg5YmN5a6M5oiQ5pW05pS55bm25o+Q5Lqk5aSN5a6h5p2Q5paZ44CCCuiBlOezu+S6uu+8mueOi+W3pSAxMzgwMDAwMDAwMAoK5pys5paH5Lu255So5LqO5ryU56S65Lit5paHIFVURi04IOaWh+acrOmihOiniOOAggo=',
          'base64',
        ),
      },
      {
        id: '11111111-1111-4111-8111-111111111106',
        supplierCode: 'SUP-1001',
        contractNo: 'HT-2026-001',
        category: 'contract_file',
        filename: 'HT-2026-001-采购框架合同.docx',
        ext: 'docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        note: '合同正文（DOCX 不提供在线预览，可下载）',
        data: Buffer.from(
          'UEsDBBQAAAAIAAAAAAB5bjPX7AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2Qy07DMBBFf8XyFsUOLBBCcbrgsQQW5QMse5JYtWcsjxvSv0dpSxeosL6Pc3W7zZKimKFwIDTyVrVSADryAUcjP7evzYMUXC16GwnByAOw3PTd9pCBxZIispFTrflRa3YTJMuKMuCS4kAl2cqKyqizdTs7gr5r23vtCCtgberaIfvuGQa7j1W8LBXwtKNAZCmeTsaVZaTNOQZnayDUM/pflOZMUAXi0cNTyHyzpCj1VcKq/A04595nKCV4EB+21DebwEj9RcVrT26fAKv6v+bKThqG4OCSX9tyIQfMAccU1UVJNuDPfn28u/8GUEsDBBQAAAAIAAAAAACb/TfqsQAAACkBAAALAAAAX3JlbHMvLnJlbHONz8FqwzAQBNBfEXuv5eQQQrDsSwjkWtwPENLaFpV2hVZNnb/PJYc49NDrMLxhumFNUd2wSGAysGtaUEiOfaDZwNd4+TiCkmrJ28iEBu4oMPTdJ0ZbA5MsIYtaUyQxsNSaT1qLWzBZaTgjrSlOXJKt0nCZdbbu286o92170OXVgK2prt5AufodqPGe8T82T1NweGb3k5DqHxNvDVCjLTNWA79cvPbPuFlTBN13enOxfwBQSwMEFAAAAAgAAAAAACnx4BT3AAAAkAEAABEAAAB3b3JkL2RvY3VtZW50LnhtbIWQwUoDMRBAf2XIWTdrD0WWbkspFA8KBesHxGS6G0xmwiTtdv9eUkFBBC9vYBgevFltrjHABSV7pl49NK0CJMvO09Crt+P+/lFBLoacCUzYqxmz2qxXU+fYniNSgWsMlLupV2MpqdM62xGjyQ0npGsMJ5ZoSm5YBj2xuCRsMWdPQwx60bZLHY0nVZXv7OY6U4VUlPXrOaXgUWAvJuLE8gE7piLGFli0i+VK16tKuTH9FhyMlBm2HTydjWMa4CBofc2FF2NHTygz7Li5g+fimn91x9Fn+G73GZLwxTt0cGIBxxMFNg6Ywvy3LKMtB9G3xVew/nnm+hNQSwECFAAUAAAACAAAAAAAeW4z1+wAAACtAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIAAAAAACb/TfqsQAAACkBAAALAAAAAAAAAAAAAAAAAB0BAABfcmVscy8ucmVsc1BLAQIUABQAAAAIAAAAAAAp8eAU9wAAAJABAAARAAAAAAAAAAAAAAAAAPcBAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAAAdAwAAAAA=',
          'base64',
        ),
      },
    ];

    for (const file of files) {
      const existing = await query
        .selectFrom('complianceFiles')
        .select('id')
        .where('id', '=', file.id)
        .executeTakeFirst();
      if (existing) continue;
      const supplier = supplierByCode.get(file.supplierCode);
      if (!supplier) continue;
      const contract = file.contractNo
        ? contractByNo.get(file.contractNo)
        : undefined;
      const data = file.data;
      await query
        .insertInto('complianceFiles')
        .values({
          id: file.id,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: data.length,
          data,
          organizationId: supplier.organizationId,
          supplierId: supplier.id,
          contractId: contract?.id ?? null,
          category: file.category,
          note: file.note,
          uploadedById: adminId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
