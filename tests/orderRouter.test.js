const request = require('supertest');
const app = require('../src/service');
const { Role, DB } = require('../src/database/database.js');

let testUser;
let testUserToken;
let adminUser;
let adminUserToken;
let franchise;
let menuItem;

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
  testUser = {
    name: 'testing',
    email: `best-test-email@test.com`,
    password: 'password1212313',
  };
  const resRegisterUser = await request(app).post('/api/auth').send(testUser);
  testUserToken = resRegisterUser.body.token;
  testUser.id = resRegisterUser.body.user.id;

  adminUser = await createAdminUser();

  const resLoginAdmin = await request(app).put('/api/auth').send({
    email: adminUser.email,
    password: adminUser.password,
  });
  adminUserToken = resLoginAdmin.body.token;

  menuItem = {
    title: 'Test Pizza',
    description: 'Delicious test pizza',
    image: 'test_pizza.png',
    price: 10.99,
  };
  const resAddMenuItem = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminUserToken}`)
    .send(menuItem);
  menuItem.id = resAddMenuItem.body.find((item) => item.title === menuItem.title).id;

  franchise = await DB.createFranchise({
    name: `best test franchise ever`,
    admins: [{ email: adminUser.email }],
  });
});

afterAll(async () => {
  await DB.deleteFranchise(franchise.id);
});

describe('orderRouter.js', () => {
  test('should return the menu', async () => {
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('should add a menu item (admin only)', async () => {
    const newMenuItem = {
      title: 'Another Test Pizza',
      description: 'Another delicious test pizza',
      image: 'another_test_pizza.png',
      price: 12.99,
    };

    const resUnauthorized = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send(newMenuItem);
    expect(resUnauthorized.status).toBe(403);

    const resNoAuth = await request(app).put('/api/order/menu').send(newMenuItem);
    expect(resNoAuth.status).toBe(401);

    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${adminUserToken}`)
      .send(newMenuItem);
    expect(res.status).toBe(200);
    expect(res.body.some((item) => item.title === newMenuItem.title)).toBe(true);
  });

  test('should return orders for authenticated user', async () => {
    const res = await request(app)
      .get('/api/order')
      .set('Authorization', `Bearer ${testUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orders');
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders.length).toBe(0);
  });

  test('without authentication should fail', async () => {
    const res = await request(app).get('/api/order');
    expect(res.status).toBe(401);
  });
});
