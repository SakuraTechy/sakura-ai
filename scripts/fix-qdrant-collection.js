/**
 * 修复 Qdrant collection 脚本
 * 删除损坏的 collection 并重新创建
 */

import fetch from 'node-fetch';

const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'test_knowledge';

async function fixQdrantCollection() {
  console.log('🔧 开始修复 Qdrant collection...\n');

  try {
    // 1. 删除损坏的 collection
    console.log(`📝 步骤 1/2: 删除损坏的 collection "${COLLECTION_NAME}"...`);

    const deleteResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'DELETE'
    });

    if (deleteResponse.ok) {
      console.log('   ✅ 损坏的 collection 已删除\n');
    } else {
      const error = await deleteResponse.text();
      console.log(`   ⚠️  删除失败（可能不存在）: ${error}\n`);
    }

    // 2. 重新创建 collection
    console.log(`📝 步骤 2/2: 重新创建 collection "${COLLECTION_NAME}"...`);

    const createResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vectors: {
          size: 1024,  // 阿里云 text-embedding-v4 的向量维度
          distance: 'Cosine'
        }
      })
    });

    if (createResponse.ok) {
      console.log('   ✅ Collection 创建成功\n');
    } else {
      const error = await createResponse.text();
      throw new Error(`创建失败: ${error}`);
    }

    // 3. 验证 collection
    console.log('🔍 验证 collection 状态...');

    const infoResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);

    if (infoResponse.ok) {
      const info = await infoResponse.json();
      console.log(`   ✅ Collection 状态正常`);
      console.log(`   - 向量维度: ${info.result.config.params.vectors.size}`);
      console.log(`   - 距离算法: ${info.result.config.params.vectors.distance}`);
      console.log(`   - 向量数量: ${info.result.vectors_count || 0}\n`);
    } else {
      throw new Error('验证失败');
    }

    console.log('✅ Qdrant collection 修复完成');
    console.log('\n💡 现在可以重新导入业务知识了。');

  } catch (error) {
    console.error('❌ 修复失败:', error.message);
    console.error('\n💡 建议：');
    console.error('   1. 确认 Qdrant 是否在运行: docker ps | findstr qdrant');
    console.error('   2. 尝试重启 Qdrant: 双击 start-qdrant.bat');
    console.error('   3. 如果问题持续，尝试完全重置: 双击 reset-qdrant.bat');
    process.exit(1);
  }
}

// 执行修复
fixQdrantCollection()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
