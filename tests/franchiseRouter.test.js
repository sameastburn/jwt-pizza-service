const request = require('supertest');
const app = require('../src/service');
const { Role, DB } = require('../src/database/database.js');

let adminUser;
let adminUserToken;
let franchiseeUser;
let franchiseeUserToken;
let testFranchise;
let testStore;

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  await DB.addUser(user);

  user.password = 'toomanysecrets';
  return user;
}

beforeAll(async () => {
  await DB.initializeDatabase();
  adminUser = await createAdminUser();

  const resLoginAdmin = await request(app).put('/api/auth').send({
    email: adminUser.email,
    password: adminUser.password,
  });
  adminUserToken = resLoginAdmin.body.token;

  const franchiseeUserPassword = 'franchiseepassword';
  franchiseeUser = {
    name: 'Franchisee User',
    email: `franchisee_${Date.now()}@test.com`,
    password: franchiseeUserPassword,
  };
  const resRegisterFranchisee = await request(app).post('/api/auth').send(franchiseeUser);
  franchiseeUserToken = resRegisterFranchisee.body.token;
  franchiseeUser.id = resRegisterFranchisee.body.user.id;

  const franchiseData = {
    name: `Test Franchise ${Date.now()}`,
    admins: [{ email: franchiseeUser.email }],
  };
  const resCreateFranchise = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminUserToken}`)
    .send(franchiseData);
  testFranchise = resCreateFranchise.body;
});

describe('franchiseRouter.js', () => {
  test('GET /api/franchise should list all franchises', async () => {
    const res = await request(app).get('/api/franchise');
    expect(res.status).toBe(200);
    expect(res.body.some((franchise) => franchise.id === testFranchise.id)).toBe(true);
  });

  test('should get user franchises when authenticated', async () => {
    const res = await request(app)
      .get(`/api/franchise/${franchiseeUser.id}`)
      .set('Authorization', `Bearer ${franchiseeUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((franchise) => franchise.id === testFranchise.id)).toBe(true);
  });

  test('userId should fail without authentication', async () => {
    const res = await request(app).get(`/api/franchise/${franchiseeUser.id}`);
    expect(res.status).toBe(401);
  });

  test('should create a franchise when admin', async () => {
    const franchiseData = {
      name: `Another Test Franchise ${Date.now()}`,
      admins: [{ email: franchiseeUser.email }],
    };
    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminUserToken}`)
      .send(franchiseData);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(franchiseData.name);
  });

  test('post should fail when not admin', async () => {
    const franchiseData = {
      name: `Unauthorized Franchise ${Date.now()}`,
      admins: [{ email: franchiseeUser.email }],
    };
    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${franchiseeUserToken}`)
      .send(franchiseData);
    expect(res.status).toBe(403);
  });

  test('should create store when admin', async () => {
    const storeData = {
      name: 'Test Store',
    };
    const res = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${adminUserToken}`)
      .send(storeData);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(storeData.name);
    testStore = res.body;
  });

  test('should create store when franchise admin', async () => {
    const storeData = {
      name: 'Franchisee Store',
    };
    const res = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${franchiseeUserToken}`)
      .send(storeData);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(storeData.name);
  });

  test('should fail when unauthorized', async () => {
    const otherUserPassword = 'otherpassword';
    const otherUser = {
      name: 'Other User',
      email: `other_${Date.now()}@test.com`,
      password: otherUserPassword,
    };
    const resRegisterOtherUser = await request(app).post('/api/auth').send(otherUser);
    const otherUserToken = resRegisterOtherUser.body.token;

    const storeData = {
      name: 'Unauthorized Store',
    };
    const res = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send(storeData);
    expect(res.status).toBe(403);
  });

  test('should delete store when franchise admin', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${testFranchise.id}/store/${testStore.id}`)
      .set('Authorization', `Bearer ${franchiseeUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'store deleted');
  });

  test('should fail when unauthorized', async () => {
    const otherUserPassword = 'otherpassword';
    const otherUser = {
      name: 'Other User',
      email: `other_${Date.now()}@test.com`,
      password: otherUserPassword,
    };
    const resRegisterOtherUser = await request(app).post('/api/auth').send(otherUser);
    const otherUserToken = resRegisterOtherUser.body.token;

    const res = await request(app)
      .delete(`/api/franchise/${testFranchise.id}/store/${testStore.id}`)
      .set('Authorization', `Bearer ${otherUserToken}`);
    expect(res.status).toBe(403);
  });

  test('should delete franchise when admin', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${testFranchise.id}`)
      .set('Authorization', `Bearer ${adminUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'franchise deleted');
  });

  test('should fail when not admin', async () => {
    const franchiseData = {
      name: `Temporary Franchise ${Date.now()}`,
      admins: [{ email: franchiseeUser.email }],
    };
    const resCreateFranchise = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminUserToken}`)
      .send(franchiseData);
    const tempFranchise = resCreateFranchise.body;

    const res = await request(app)
      .delete(`/api/franchise/${tempFranchise.id}`)
      .set('Authorization', `Bearer ${franchiseeUserToken}`);
    expect(res.status).toBe(403);

    await request(app)
      .delete(`/api/franchise/${tempFranchise.id}`)
      .set('Authorization', `Bearer ${adminUserToken}`);
  });
});
