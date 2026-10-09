/// <reference types="jasmine" />
import { of, throwError } from 'rxjs';
import { GeoSearchComponent } from './geo-search.component';
import { ApiService } from '../../services/api.service';

describe('GeoSearchComponent', () => {
  let api: jasmine.SpyObj<ApiService>;
  let comp: GeoSearchComponent;

  const custRes = {
    radiusMeters: 1000,
    count: 2,
    customers: [
      { id: 1, name: 'A', phone: '1', address: 'a', lat: 16.24, lng: 103.25, distanceMeters: 100 },
      { id: 2, name: 'B', phone: '2', address: 'b', lat: 16.25, lng: 103.26, distanceMeters: 900 }
    ]
  };
  const ordRes = {
    radiusMeters: 2000,
    count: 1,
    orders: [
      { id: 5, orderNumber: 'ORD-1', customerId: 1, customerName: 'A', boxCount: 2, lat: 16.24, lng: 103.25, distanceMeters: 1500 }
    ]
  };

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['getCustomersNearby', 'getOrdersNearby']);
    api.getCustomersNearby.and.returnValue(of(custRes));
    api.getOrdersNearby.and.returnValue(of(ordRes));
    comp = new GeoSearchComponent(api); // no ngAfterViewInit -> no Leaflet/DOM needed
  });

  it('runs a valid customer search with default 1 km radius', () => {
    comp.cust.lat = '16.2465';
    comp.cust.lng = '103.2505';
    comp.searchCustomers();
    expect(comp.cust.radiusKm).toBe(1);
    expect(api.getCustomersNearby).toHaveBeenCalledOnceWith(16.2465, 103.2505, 1);
    expect(comp.cust.count).toBe(2);
    expect(comp.cust.results.length).toBe(2);
    expect(comp.cust.searched).toBeTrue();
    expect(comp.cust.error).toBe('');
  });

  it('runs a valid order search with default 2 km radius', () => {
    comp.ord.lat = '16.2465';
    comp.ord.lng = '103.2505';
    comp.searchOrders();
    expect(comp.ord.radiusKm).toBe(2);
    expect(api.getOrdersNearby).toHaveBeenCalledOnceWith(16.2465, 103.2505, 2);
    expect(comp.ord.count).toBe(1);
    expect(comp.ord.results[0].boxCount).toBe(2);
  });

  it('passes every allowed customer radius to the API', () => {
    comp.cust.lat = '16.2465'; comp.cust.lng = '103.2505';
    for (const km of [0.5, 1, 2, 3, 5, 10]) {
      comp.cust.radiusKm = km;
      comp.searchCustomers();
      expect(api.getCustomersNearby.calls.mostRecent().args).toEqual([16.2465, 103.2505, km]);
    }
  });

  it('passes every allowed order radius to the API', () => {
    comp.ord.lat = '16.2465'; comp.ord.lng = '103.2505';
    for (const km of [0.5, 1, 2, 3, 5, 10]) {
      comp.ord.radiusKm = km;
      comp.searchOrders();
      expect(api.getOrdersNearby.calls.mostRecent().args).toEqual([16.2465, 103.2505, km]);
    }
  });

  it('radius selectors are independent', () => {
    comp.cust.radiusKm = 5;
    expect(comp.ord.radiusKm).toBe(2);
    comp.ord.radiusKm = 10;
    expect(comp.cust.radiusKm).toBe(5);
  });

  it('rejects empty inputs without calling the API', () => {
    comp.cust.lat = '';
    comp.cust.lng = '';
    comp.searchCustomers();
    comp.searchOrders();
    expect(comp.cust.error).toContain('กรุณากรอก');
    expect(comp.ord.error).toContain('กรุณากรอก');
    expect(api.getCustomersNearby).not.toHaveBeenCalled();
    expect(api.getOrdersNearby).not.toHaveBeenCalled();
  });

  it('rejects invalid latitude', () => {
    comp.cust.lat = '999';
    comp.cust.lng = '103';
    comp.searchCustomers();
    expect(comp.cust.error).toContain('-90');
    expect(api.getCustomersNearby).not.toHaveBeenCalled();
  });

  it('rejects invalid longitude', () => {
    comp.ord.lat = '16';
    comp.ord.lng = '999';
    comp.searchOrders();
    expect(comp.ord.error).toContain('-180');
    expect(api.getOrdersNearby).not.toHaveBeenCalled();
  });

  it('shows empty state when backend returns zero results', () => {
    api.getCustomersNearby.and.returnValue(of({ radiusMeters: 1000, count: 0, customers: [] }));
    comp.cust.lat = '0';
    comp.cust.lng = '0';
    comp.searchCustomers();
    expect(comp.cust.count).toBe(0);
    expect(comp.cust.results).toEqual([]);
    expect(comp.cust.error).toBe('');
    expect(comp.cust.searched).toBeTrue();
  });

  it('surfaces an error message on HTTP failure', () => {
    api.getOrdersNearby.and.returnValue(throwError(() => new Error('500')));
    comp.ord.lat = '16.2';
    comp.ord.lng = '103.2';
    comp.searchOrders();
    expect(comp.ord.error).toContain('ไม่สำเร็จ');
    expect(comp.ord.loading).toBeFalse();
    expect(comp.ord.results).toEqual([]); // no fake results
  });

  it('supports consecutive searches with different coordinates', () => {
    comp.cust.lat = '16.2465';
    comp.cust.lng = '103.2505';
    comp.searchCustomers();
    comp.cust.lat = '0';
    comp.cust.lng = '0';
    api.getCustomersNearby.and.returnValue(of({ radiusMeters: 1000, count: 0, customers: [] }));
    comp.searchCustomers();
    expect(api.getCustomersNearby).toHaveBeenCalledTimes(2);
    expect(api.getCustomersNearby.calls.mostRecent().args).toEqual([0, 0, 1]);
    expect(comp.cust.count).toBe(0);
  });

  it('keeps customer and order results independent', () => {
    comp.cust.lat = '16.2465'; comp.cust.lng = '103.2505';
    comp.ord.lat = '16.2465'; comp.ord.lng = '103.2505';
    comp.searchCustomers();
    comp.searchOrders();
    expect(comp.cust.count).toBe(2);
    expect(comp.ord.count).toBe(1);
    expect(comp.cust.results[0].id).toBe(1);
    expect(comp.ord.results[0].orderNumber).toBe('ORD-1');
  });

  it('ignores a second request while one is in flight', () => {
    api.getCustomersNearby.and.returnValue(of(custRes));
    comp.cust.lat = '16.2'; comp.cust.lng = '103.2';
    comp.cust.loading = true; // simulate in-flight request
    comp.searchCustomers();
    expect(api.getCustomersNearby).not.toHaveBeenCalled();
  });
});
