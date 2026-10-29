import { Component, OnInit, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import * as L from 'leaflet';
import { CustomerApi } from '../../services/api/customer-api';
import { Customer } from '../../model/customer';
import { ZONES } from '../../model/zone';
import { APP_ICONS, escapeHtml, iconSvg } from '../../shared/icons';
import { MAX_DELIVERY_RADIUS_KM, SHOP_LOCATION, distanceFromShopKm } from '../../shared/delivery-area';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './customers.html',
  styleUrl: './customers.css',
})
export class Customers implements OnInit, AfterViewInit, OnDestroy {
  customers: Customer[] = [];
  searchTerm: string = '';
  selectedCustomer: Customer | null = null;
  
  readonly zones = ZONES;
  readonly icons = APP_ICONS;
  readonly maxRadiusKm = MAX_DELIVERY_RADIUS_KM;
  isModalOpen = false;
  saving = false;
  formError = '';
  editMode = false;
  formCustomer: Customer = {
    name: '',
    phone: '',
    address: '',
    lat: 16.2465,
    lng: 103.2505
  };

  private map?: L.Map;
  private markersLayer = L.layerGroup();
  private tempMarker?: L.Marker;

  private customerApi = inject(CustomerApi);

  get formDistanceKm(): number {
    return distanceFromShopKm(Number(this.formCustomer.lat), Number(this.formCustomer.lng));
  }

  get formOutsideArea(): boolean {
    return this.formDistanceKm > MAX_DELIVERY_RADIUS_KM;
  }

  ngOnInit() {
    this.loadCustomers();
  }

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  get filteredCustomers(): Customer[] {
    if (!this.searchTerm.trim()) return this.customers;
    const term = this.searchTerm.toLowerCase();
    return this.customers.filter(c => 
      c.name.toLowerCase().includes(term) || c.phone.includes(term) || c.address.toLowerCase().includes(term)
    );
  }

  async loadCustomers() {
    this.customers = await this.customerApi.getCustomers();
    this.renderCustomerMarkers();
  }

  private initMap() {
    this.map = L.map('customer-map').setView([16.2465, 103.2505], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    L.circle([SHOP_LOCATION.lat, SHOP_LOCATION.lng], {
      radius: MAX_DELIVERY_RADIUS_KM * 1000,
      color: '#e2580e',
      weight: 2,
      dashArray: '6 6',
      fillColor: '#e2580e',
      fillOpacity: 0.04,
      interactive: false
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);

    const shopIcon = L.divIcon({
      html: iconSvg(APP_ICONS.store, 18, '#fff'),
      className: 'custom-shop-marker',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    L.marker([16.2465, 103.2505], { icon: shopIcon })
      .addTo(this.map)
      .bindPopup('<div class="map-popup-title">ร้านข้าวกล่องเดลิเวอรี่</div><div class="map-popup-row">จุดเริ่มต้นส่ง 11:30 น.</div>');

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.isModalOpen) {
        this.formCustomer.lat = Number(e.latlng.lat.toFixed(6));
        this.formCustomer.lng = Number(e.latlng.lng.toFixed(6));
        this.updateTempMarker(e.latlng.lat, e.latlng.lng);
      }
    });

    this.renderCustomerMarkers();
  }

  private renderCustomerMarkers() {
    if (!this.map) return;
    this.markersLayer.clearLayers();

    this.customers.forEach(c => {
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: 8,
        fillColor: '#e2580e',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
      });

      marker.bindPopup(`
        <div class="map-popup-title">${escapeHtml(c.name)}</div>
        <div class="map-popup-row">${iconSvg(APP_ICONS.phone, 13)} ${escapeHtml(c.phone)}</div>
        <div class="map-popup-row">${iconSvg(APP_ICONS.mapPin, 13)} ${escapeHtml(c.address)}</div>
      `);

      marker.on('click', () => {
        this.selectedCustomer = c;
      });

      this.markersLayer.addLayer(marker);
    });
  }

  focusOnMap(c: Customer) {
    this.selectedCustomer = c;
    if (this.map) {
      this.map.flyTo([c.lat, c.lng], 16, { duration: 1 });
    }
  }

  openAddModal() {
    this.editMode = false;
    this.formCustomer = {
      name: '',
      phone: '',
      address: '',
      lat: 16.2465,
      lng: 103.2505,
      zone: 'ขามเรียง'
    };
    this.formError = '';
    this.isModalOpen = true;
    this.updateTempMarker(this.formCustomer.lat, this.formCustomer.lng);
  }

  editCustomer(c: Customer) {
    this.editMode = true;
    this.formCustomer = { ...c };
    this.formError = '';
    this.isModalOpen = true;
    this.updateTempMarker(c.lat, c.lng);
  }

  private updateTempMarker(lat: number, lng: number) {
    if (!this.map) return;
    if (this.tempMarker) {
      this.tempMarker.setLatLng([lat, lng]);
    } else {
      const pinIcon = L.divIcon({
        html: iconSvg(APP_ICONS.mapPin, 34, '#bf4507', 2.4),
        className: 'pick-marker',
        iconSize: [34, 34],
        iconAnchor: [17, 32]
      });
      this.tempMarker = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(this.map);
      this.tempMarker.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        this.formCustomer.lat = Number(pos.lat.toFixed(6));
        this.formCustomer.lng = Number(pos.lng.toFixed(6));
      });
    }
  }

  closeModal() {
    this.isModalOpen = false;
    if (this.tempMarker && this.map) {
      this.map.removeLayer(this.tempMarker);
      this.tempMarker = undefined;
    }
  }

  async saveCustomer() {
    if (this.formOutsideArea) {
      this.formError = `หมุดอยู่ห่างร้าน ${this.formDistanceKm.toFixed(2)} กม. เกินพื้นที่จัดส่ง ${MAX_DELIVERY_RADIUS_KM} กม.`;
      return;
    }
    this.formError = '';
    this.saving = true;
    try {
      if (this.editMode && this.formCustomer.id) {
        await this.customerApi.updateCustomer(this.formCustomer.id, this.formCustomer);
      } else {
        await this.customerApi.createCustomer(this.formCustomer);
      }
      this.closeModal();
      await this.loadCustomers();
    } catch (err) {
      this.formError =
        (err instanceof HttpErrorResponse && err.error?.error) || 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
    } finally {
      this.saving = false;
    }
  }

  async deleteCustomer(c: Customer) {
    if (c.id && confirm(`ต้องการลบลูกค้า "${c.name}" หรือไม่?`)) {
      await this.customerApi.deleteCustomer(c.id);
      await this.loadCustomers();
    }
  }
}
