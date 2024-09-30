const { DB } = require('../src/database/database');
const { Role } = require('../src/model/model');
const request = require('supertest');
const app = require('../src/service');

describe('database.js', () => {
  let testUser;
  let adminUser;
  let menuItem;
  let franchise;
  let store;

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
    testUser = { name: 'best-test-user-123', email: '', password: 'password12321340' };
    testUser.email = randomName() + '@fake.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    testUser.id = registerRes.body.user.id;

    const adminUser = await createAdminUser();

    menuItem = {
      title: 'Margherita Pizza',
      description: 'Classic pizza with tomatoes and mozzarella cheese',
      image: 'image_url',
      price: 9.99,
    };
    menuItem = await DB.addMenuItem(menuItem);

    franchise = {
      name: 'test franchise 1',
      admins: [{ email: adminUser.email }],
    };
    franchise = await DB.createFranchise(franchise);

    store = {
      name: 'Test Store',
    };
    store = await DB.createStore(franchise.id, store);
  });

  test('should update user email', async () => {
    const newEmail = `updated_${testUser.email}`;
    const updatedUser = await DB.updateUser(
      testUser.id,
      newEmail,
      testUser.password
    );
    expect(updatedUser).toHaveProperty('email', newEmail);
  });

  test('should log in and out user', async () => {
    const token = 'fake-token-123';
    await DB.loginUser(testUser.id, token);
    let isLoggedIn = await DB.isLoggedIn(token);
    expect(isLoggedIn).toBe(true);

    await DB.logoutUser(token);
    isLoggedIn = await DB.isLoggedIn(token);
    expect(isLoggedIn).toBe(false);
  });

  test('should add and retrieve orders', async () => {
    const order = {
      franchiseId: franchise.id,
      storeId: store.id,
      items: [
        {
          menuId: menuItem.id,
          description: menuItem.description,
          price: menuItem.price,
        },
      ],
    };
    const addedOrder = await DB.addDinerOrder(testUser, order);
    expect(addedOrder).toHaveProperty('id');

    const orders = await DB.getOrders(testUser);
    expect(orders.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: addedOrder.id }),
      ])
    );
  });

  test('should delete a franchise', async () => {
    await DB.deleteFranchise(franchise.id);
    const franchises = await DB.getFranchises(adminUser);
    expect(franchises).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: franchise.id }),
      ])
    );
  });
});
