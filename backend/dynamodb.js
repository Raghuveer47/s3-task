const crypto = require("crypto");
const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

function getMissingDynamoConfig() {
  return process.env.DYNAMODB_TABLE_NAME ? [] : ["DYNAMODB_TABLE_NAME"];
}

function getTableName() {
  return process.env.DYNAMODB_TABLE_NAME;
}

function createDynamoClient() {
  return new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function createDocumentClient() {
  return DynamoDBDocumentClient.from(createDynamoClient());
}

async function initTable() {
  const client = createDynamoClient();
  const TableName = getTableName();

  try {
    await client.send(new DescribeTableCommand({ TableName }));
    return;
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") {
      throw error;
    }
  }

  await client.send(
    new CreateTableCommand({
      TableName,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    })
  );

  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName });
}

async function saveProfileImage({ studentName, key, originalName, contentType }) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await createDocumentClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        id,
        studentName,
        s3Key: key,
        originalName,
        contentType,
        createdAt,
      },
    })
  );

  return id;
}

async function listProfileImages() {
  const response = await createDocumentClient().send(
    new ScanCommand({
      TableName: getTableName(),
    })
  );

  const items = response.Items || [];
  items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return items;
}

module.exports = {
  getMissingDynamoConfig,
  initTable,
  saveProfileImage,
  listProfileImages,
};
