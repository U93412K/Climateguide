/**
 * Additional ILLUSTRATIVE sample data: flood-prone districts in eight more Indian states.
 *
 * Districts are real flood-affected areas, but coordinates are approximate and every number
 * (population, flood-prone share, stock, terrain scores, supplier inventory, road distances and
 * speeds) is INVENTED for demonstration. Replace with census, hydrology and OSM data before
 * any real use. Terrain scores: floodHistory and drainage are 0..1 (higher drainage = better).
 */

// settlement: [name, lat, lon, population, floodProneShare]
const rg = (code, name, state, lat, lon, elevationM, riverDistanceKm, floodHistory, drainage, inv, settlements) => ({
  code, name, state, center: { lat, lon }, elevationM, riverDistanceKm, floodHistory, drainage,
  localInventory: { food: inv[0], water: inv[1], medicine: inv[2] },
  settlements: settlements.map(([n, la, lo, population, floodProneShare]) => ({ name: n, lat: la, lon: lo, population, floodProneShare })),
});

export const INDIA_REGIONS = [
  // ---- Bihar (Kosi / Gandak / Bagmati floods) ----
  rg('SPL', 'Supaul', 'Bihar', 26.12, 86.6, 50, 3, 0.95, 0.25, [3000, 20000, 60], [
    ['Supaul Town', 26.12, 86.6, 60000, 0.6], ['Birpur', 26.5, 87.0, 40000, 0.8], ['Triveniganj', 26.22, 86.78, 30000, 0.85]]),
  rg('SHS', 'Saharsa', 'Bihar', 25.88, 86.6, 45, 5, 0.85, 0.3, [4000, 28000, 80], [
    ['Saharsa Town', 25.88, 86.6, 90000, 0.4], ['Simri Bakhtiyarpur', 25.7, 86.55, 35000, 0.7], ['Mahishi', 25.83, 86.7, 25000, 0.75]]),
  rg('DBG', 'Darbhanga', 'Bihar', 26.15, 85.9, 50, 6, 0.8, 0.35, [6000, 40000, 110], [
    ['Darbhanga Town', 26.15, 85.9, 300000, 0.2], ['Biraul', 26.1, 86.05, 40000, 0.6], ['Hayaghat', 26.0, 85.95, 30000, 0.65]]),
  // ---- Odisha (Mahanadi delta, cyclone surge) ----
  rg('KEN', 'Kendrapara', 'Odisha', 20.5, 86.42, 10, 2, 0.9, 0.3, [3500, 25000, 70], [
    ['Kendrapara Town', 20.5, 86.42, 50000, 0.5], ['Rajnagar', 20.52, 86.78, 28000, 0.75], ['Aul', 20.65, 86.65, 24000, 0.8]]),
  rg('PUR', 'Puri', 'Odisha', 19.81, 85.83, 8, 4, 0.7, 0.4, [5000, 35000, 100], [
    ['Puri Town', 19.81, 85.83, 200000, 0.25], ['Pipili', 20.11, 85.83, 20000, 0.5], ['Brahmagiri', 19.9, 85.65, 18000, 0.6]]),
  rg('BAL', 'Balasore', 'Odisha', 21.49, 86.93, 15, 3, 0.8, 0.35, [4500, 30000, 90], [
    ['Balasore Town', 21.49, 86.93, 150000, 0.3], ['Jaleswar', 21.8, 87.2, 30000, 0.6], ['Bhograi', 21.62, 87.2, 22000, 0.7]]),
  // ---- West Bengal (Ganga-Padma erosion, Sundarbans, Damodar) ----
  rg('MAL', 'Malda', 'West Bengal', 25.01, 88.14, 25, 3, 0.85, 0.3, [5000, 35000, 100], [
    ['English Bazar', 25.0, 88.14, 220000, 0.3], ['Manikchak', 25.3, 88.05, 40000, 0.7], ['Kaliachak', 24.85, 88.02, 45000, 0.75]]),
  rg('MUR', 'Murshidabad', 'West Bengal', 24.18, 88.27, 20, 2, 0.8, 0.35, [5500, 38000, 110], [
    ['Berhampore', 24.1, 88.25, 200000, 0.25], ['Lalgola', 24.42, 88.25, 35000, 0.8], ['Jangipur', 24.47, 88.07, 80000, 0.5]]),
  rg('S24', 'South 24 Parganas', 'West Bengal', 22.15, 88.4, 5, 1, 0.9, 0.25, [6000, 45000, 120], [
    ['Diamond Harbour', 22.19, 88.19, 60000, 0.4], ['Gosaba', 22.16, 88.8, 40000, 0.9], ['Kakdwip', 21.88, 88.19, 45000, 0.7]]),
  // ---- Kerala (monsoon floods, backwaters) ----
  rg('ALP', 'Alappuzha', 'Kerala', 9.49, 76.34, 2, 2, 0.85, 0.3, [5000, 38000, 100], [
    ['Alappuzha Town', 9.49, 76.34, 180000, 0.5], ['Kuttanad', 9.4, 76.4, 70000, 0.95], ['Chengannur', 9.32, 76.61, 40000, 0.6]]),
  rg('EKM', 'Ernakulam', 'Kerala', 9.98, 76.28, 6, 3, 0.7, 0.45, [9000, 70000, 180], [
    ['Kochi', 9.93, 76.27, 600000, 0.15], ['Aluva', 10.1, 76.35, 70000, 0.4], ['North Paravur', 10.15, 76.22, 45000, 0.5]]),
  rg('IDK', 'Idukki', 'Kerala', 9.85, 76.97, 800, 8, 0.6, 0.55, [2500, 18000, 60], [
    ['Thodupuzha', 9.89, 76.72, 50000, 0.2], ['Munnar', 10.09, 77.06, 40000, 0.15], ['Kumily', 9.6, 77.17, 30000, 0.2]]),
  // ---- Uttar Pradesh (Ghaghara / Rapti / Sharda floods) ----
  rg('GKP', 'Gorakhpur', 'Uttar Pradesh', 26.76, 83.37, 77, 6, 0.75, 0.4, [8000, 55000, 150], [
    ['Gorakhpur City', 26.76, 83.37, 700000, 0.1], ['Campierganj', 26.9, 83.45, 40000, 0.5], ['Sahjanwa', 26.67, 83.2, 35000, 0.55]]),
  rg('BAH', 'Bahraich', 'Uttar Pradesh', 27.57, 81.6, 110, 4, 0.85, 0.3, [4500, 30000, 90], [
    ['Bahraich Town', 27.57, 81.6, 120000, 0.3], ['Nanpara', 27.87, 81.5, 45000, 0.5], ['Mahsi', 27.5, 81.25, 40000, 0.7]]),
  // ---- Gujarat (Narmada / Tapi / Vishwamitri urban floods) ----
  rg('SRT', 'Surat', 'Gujarat', 21.17, 72.83, 13, 2, 0.75, 0.5, [12000, 90000, 250], [
    ['Surat City', 21.17, 72.83, 1500000, 0.12], ['Kamrej', 21.27, 72.95, 60000, 0.35], ['Olpad', 21.33, 72.74, 40000, 0.4]]),
  rg('VAD', 'Vadodara', 'Gujarat', 22.31, 73.18, 39, 1, 0.75, 0.5, [10000, 75000, 200], [
    ['Vadodara City', 22.31, 73.18, 1100000, 0.15], ['Padra', 22.24, 73.09, 40000, 0.4], ['Karjan', 22.05, 73.12, 35000, 0.45]]),
  // ---- Maharashtra (Krishna / Panchganga floods) ----
  rg('KLP', 'Kolhapur', 'Maharashtra', 16.7, 74.24, 550, 3, 0.8, 0.45, [6000, 45000, 120], [
    ['Kolhapur City', 16.7, 74.24, 500000, 0.2], ['Shirol', 16.75, 74.6, 45000, 0.7], ['Karveer', 16.65, 74.2, 40000, 0.4]]),
  rg('SGL', 'Sangli', 'Maharashtra', 16.85, 74.57, 550, 2, 0.8, 0.45, [5500, 40000, 110], [
    ['Sangli City', 16.85, 74.57, 400000, 0.25], ['Miraj', 16.83, 74.64, 150000, 0.2], ['Palus', 17.0, 74.45, 30000, 0.6]]),
  // ---- Tamil Nadu (northeast monsoon, Cauvery delta) ----
  rg('CHN', 'Chennai', 'Tamil Nadu', 13.08, 80.27, 6, 1, 0.8, 0.4, [14000, 100000, 300], [
    ['Chennai City', 13.08, 80.27, 2000000, 0.12], ['Tambaram', 12.92, 80.12, 150000, 0.25], ['Ennore', 13.22, 80.32, 50000, 0.4]]),
  rg('CUD', 'Cuddalore', 'Tamil Nadu', 11.75, 79.77, 5, 2, 0.8, 0.35, [4000, 28000, 80], [
    ['Cuddalore Town', 11.75, 79.77, 170000, 0.35], ['Chidambaram', 11.4, 79.69, 60000, 0.5], ['Panruti', 11.78, 79.55, 30000, 0.4]]),
  rg('NGP', 'Nagapattinam', 'Tamil Nadu', 10.77, 79.84, 3, 2, 0.75, 0.3, [3000, 20000, 60], [
    ['Nagapattinam Town', 10.77, 79.84, 100000, 0.5], ['Vedaranyam', 10.37, 79.85, 30000, 0.8], ['Sirkazhi', 11.24, 79.74, 40000, 0.55]]),
  // ---- Cyclone Arnab sample set: coastal Andhra Pradesh and Ganjam (Odisha) ----
  rg('BAP', 'Bapatla', 'Andhra Pradesh', 15.9, 80.47, 8, 12, 0.75, 0.35, [5000, 30000, 100], [
    ['Bapatla Town', 15.9, 80.47, 70000, 0.8], ['Chirala', 15.82, 80.35, 90000, 0.7], ['Repalle', 16.02, 80.83, 40000, 0.85]]),
  rg('WGD', 'West Godavari', 'Andhra Pradesh', 16.7, 81.1, 12, 4, 0.85, 0.3, [7000, 45000, 150], [
    ['Narsapur', 16.43, 81.7, 60000, 0.95], ['Bhimavaram', 16.54, 81.52, 150000, 0.75], ['Palakollu', 16.52, 81.73, 60000, 0.85]]),
  rg('KON', 'Konaseema', 'Andhra Pradesh', 16.58, 82.02, 5, 2, 0.95, 0.2, [3000, 20000, 80], [
    ['Amalapuram', 16.58, 82.0, 60000, 0.85], ['Razole', 16.47, 81.83, 35000, 0.9], ['Mummidivaram', 16.65, 82.12, 30000, 0.85]]),
  rg('KAK', 'Kakinada', 'Andhra Pradesh', 16.99, 82.25, 5, 8, 0.8, 0.35, [10000, 65000, 200], [
    ['Kakinada City', 16.99, 82.25, 400000, 0.7], ['Pithapuram', 17.12, 82.27, 60000, 0.6], ['Samalkot', 17.05, 82.18, 50000, 0.65]]),
  rg('VSK', 'Visakhapatnam', 'Andhra Pradesh', 17.69, 83.22, 15, 5, 0.65, 0.45, [20000, 120000, 500], [
    ['Visakhapatnam City', 17.69, 83.22, 1700000, 0.6], ['Anakapalle', 17.69, 83.0, 90000, 0.7], ['Bheemunipatnam', 17.89, 83.45, 50000, 0.8]]),
  rg('GAN', 'Ganjam', 'Odisha', 19.38, 84.88, 15, 6, 0.75, 0.4, [6000, 40000, 120], [
    ['Berhampur', 19.31, 84.79, 360000, 0.6], ['Chhatrapur', 19.35, 84.98, 25000, 0.8], ['Gopalpur', 19.26, 84.91, 20000, 0.9]]),
];

const sup = (code, name, type, lat, lon, inv, n) => ({
  code, name, type, location: { lat, lon }, contact: `+91-00000-${String(10 + n).padStart(5, '0')}`,
  inventory: { food: inv[0], water: inv[1], medicine: inv[2] },
});

/** Supplier records; inventoryUpdatedAt is added by seed.js so freshness is relative to "now". */
export const INDIA_SUPPLIERS = [
  sup('SUP-PAT-01', 'Patna Central Relief Depot', 'Government depot', 25.61, 85.14, [150000, 900000, 2100], 1),
  sup('SUP-MUZ-01', 'Muzaffarpur Grain & Water Store', 'Commercial supplier', 26.12, 85.39, [90000, 360000, 750], 2),
  sup('SUP-BBS-01', 'Bhubaneswar State Relief Depot', 'Government depot', 20.3, 85.82, [135000, 750000, 1800], 3),
  sup('SUP-CTC-01', 'Cuttack Medical & Food Warehouse', 'NGO', 20.46, 85.88, [60000, 270000, 1200], 4),
  sup('SUP-KOL-01', 'Kolkata Port Relief Depot', 'Government depot', 22.57, 88.36, [180000, 1050000, 2700], 5),
  sup('SUP-BHP-01', 'Berhampore Community Store', 'NGO', 24.1, 88.25, [54000, 210000, 450], 6),
  sup('SUP-KOC-01', 'Kochi Relief Logistics Hub', 'Government depot', 9.93, 76.27, [120000, 660000, 1650], 7),
  sup('SUP-TSR-01', 'Thrissur Food & Water Store', 'Commercial supplier', 10.53, 76.21, [75000, 300000, 600], 8),
  sup('SUP-LKO-01', 'Lucknow Regional Depot', 'Government depot', 26.85, 80.95, [165000, 840000, 1950], 9),
  sup('SUP-BST-01', 'Basti Wholesale Grain Store', 'Commercial supplier', 26.8, 82.76, [66000, 240000, 360], 10),
  sup('SUP-AMD-01', 'Ahmedabad Relief Warehouse', 'Government depot', 23.02, 72.57, [180000, 990000, 2400], 11),
  sup('SUP-BRC-01', 'Bharuch Water Works Store', 'Government depot', 21.7, 72.99, [45000, 600000, 450], 12),
  sup('SUP-PNQ-01', 'Pune Divisional Relief Depot', 'Government depot', 18.52, 73.86, [165000, 780000, 2100], 13),
  sup('SUP-STR-01', 'Satara Food Store', 'NGO', 17.69, 74.0, [60000, 210000, 540], 14),
  sup('SUP-VLR-01', 'Vellore Relief Store', 'Government depot', 12.92, 79.13, [90000, 420000, 900], 15),
  sup('SUP-VPM-01', 'Villupuram Grain & Water Store', 'Commercial supplier', 11.94, 79.49, [84000, 450000, 660], 16),
  sup('SUP-GNT-01', 'Guntur Regional Relief Depot', 'Government depot', 16.31, 80.44, [150000, 800000, 1800], 17),
  sup('SUP-VJA-01', 'Vijayawada Relief Logistics Hub', 'Government depot', 16.51, 80.65, [120000, 700000, 1500], 18),
  sup('SUP-RJY-01', 'Rajahmundry Food & Water Store', 'Commercial supplier', 17.0, 81.78, [90000, 450000, 900], 19),
  sup('SUP-VSK-01', 'Visakhapatnam Port Relief Depot', 'Government depot', 17.72, 83.3, [150000, 800000, 1800], 20),
  sup('SUP-BER-01', 'Berhampur Relief Store', 'NGO', 19.31, 84.79, [60000, 250000, 600], 21),
];

const R = (c) => `R-${c}`;

// [code, from, to, name, kind, speedKmh]. Each state cluster has more than one path to its
// main destinations, so a blocked road can be rerouted. Distances are derived in seed.js.
export const INDIA_EDGE_DEFS = [
  // Bihar
  ['E19', 'SUP-PAT-01', 'SUP-MUZ-01', 'Patna-Muzaffarpur highway', 'road', 60],
  ['E20', 'SUP-MUZ-01', R('DBG'), 'Muzaffarpur-Darbhanga road', 'road', 50],
  ['E21', R('DBG'), R('SHS'), 'Darbhanga-Saharsa road', 'road', 45],
  ['E22', R('SHS'), R('SPL'), 'Saharsa-Supaul road', 'road', 45],
  ['E23', R('DBG'), R('SPL'), 'Darbhanga-Supaul road', 'road', 40],
  ['E24', 'SUP-PAT-01', R('SHS'), 'Patna-Saharsa road via Mokama', 'road', 45],
  // Odisha
  ['E25', 'SUP-BBS-01', 'SUP-CTC-01', 'Bhubaneswar-Cuttack road', 'road', 55],
  ['E26', 'SUP-CTC-01', R('KEN'), 'Cuttack-Kendrapara road', 'road', 45],
  ['E27', 'SUP-BBS-01', R('PUR'), 'Bhubaneswar-Puri highway', 'road', 60],
  ['E28', 'SUP-CTC-01', R('BAL'), 'Cuttack-Balasore highway', 'road', 60],
  ['E29', R('KEN'), R('BAL'), 'Kendrapara-Balasore coastal road', 'road', 40],
  ['E30', 'SUP-BBS-01', R('KEN'), 'Bhubaneswar-Kendrapara road', 'road', 45],
  // West Bengal
  ['E31', 'SUP-KOL-01', R('S24'), 'Kolkata-South 24 Parganas road', 'road', 40],
  ['E32', 'SUP-KOL-01', 'SUP-BHP-01', 'Kolkata-Berhampore highway (NH12)', 'road', 55],
  ['E33', 'SUP-BHP-01', R('MUR'), 'Berhampore-Murshidabad road', 'road', 40],
  ['E34', 'SUP-BHP-01', R('MAL'), 'Berhampore-Malda highway', 'road', 55],
  ['E35', R('MUR'), R('MAL'), 'Murshidabad-Malda road', 'road', 40],
  ['E36', 'SUP-KOL-01', R('MUR'), 'Kolkata-Murshidabad road (alternate)', 'road', 45],
  // Kerala
  ['E37', 'SUP-KOC-01', R('EKM'), 'Kochi city roads', 'road', 30],
  ['E38', 'SUP-KOC-01', R('ALP'), 'Kochi-Alappuzha coastal highway', 'road', 50],
  ['E39', 'SUP-TSR-01', 'SUP-KOC-01', 'Thrissur-Kochi highway (NH544)', 'road', 55],
  ['E40', R('EKM'), R('IDK'), 'Ernakulam-Idukki hill road', 'road', 35],
  ['E41', R('EKM'), R('ALP'), 'Ernakulam-Alappuzha road', 'road', 45],
  ['E42', 'SUP-TSR-01', R('EKM'), 'Thrissur-Ernakulam road (alternate)', 'road', 45],
  // Uttar Pradesh
  ['E43', 'SUP-LKO-01', R('BAH'), 'Lucknow-Bahraich highway', 'road', 55],
  ['E44', 'SUP-LKO-01', 'SUP-BST-01', 'Lucknow-Basti highway', 'road', 60],
  ['E45', 'SUP-BST-01', R('GKP'), 'Basti-Gorakhpur highway', 'road', 60],
  ['E46', R('BAH'), 'SUP-BST-01', 'Bahraich-Basti road', 'road', 40],
  ['E47', 'SUP-LKO-01', R('GKP'), 'Lucknow-Gorakhpur road via Barabanki', 'road', 50],
  // Gujarat
  ['E48', 'SUP-AMD-01', R('VAD'), 'Ahmedabad-Vadodara expressway', 'road', 80],
  ['E49', R('VAD'), 'SUP-BRC-01', 'Vadodara-Bharuch road', 'road', 60],
  ['E50', 'SUP-BRC-01', R('SRT'), 'Bharuch-Surat highway', 'road', 60],
  ['E51', 'SUP-AMD-01', 'SUP-BRC-01', 'Ahmedabad-Bharuch road (alternate)', 'road', 55],
  ['E52', R('VAD'), R('SRT'), 'Vadodara-Surat road', 'road', 55],
  // Maharashtra
  ['E53', 'SUP-PNQ-01', 'SUP-STR-01', 'Pune-Satara highway (NH48)', 'road', 60],
  ['E54', 'SUP-STR-01', R('KLP'), 'Satara-Kolhapur highway', 'road', 55],
  ['E55', 'SUP-STR-01', R('SGL'), 'Satara-Sangli road', 'road', 50],
  ['E56', R('SGL'), R('KLP'), 'Sangli-Kolhapur road', 'road', 50],
  ['E57', 'SUP-PNQ-01', R('SGL'), 'Pune-Sangli road (alternate)', 'road', 50],
  // Tamil Nadu
  ['E58', 'SUP-VLR-01', R('CHN'), 'Vellore-Chennai highway', 'road', 65],
  ['E59', 'SUP-VPM-01', R('CHN'), 'Villupuram-Chennai highway (NH32)', 'road', 60],
  ['E60', 'SUP-VLR-01', 'SUP-VPM-01', 'Vellore-Villupuram road', 'road', 50],
  ['E61', 'SUP-VPM-01', R('CUD'), 'Villupuram-Cuddalore road', 'road', 50],
  ['E62', R('CUD'), R('NGP'), 'Cuddalore-Nagapattinam coastal road', 'road', 45],
  ['E63', 'SUP-VPM-01', R('NGP'), 'Villupuram-Nagapattinam road (alternate)', 'road', 40],
  // Coastal Andhra Pradesh and Ganjam
  ['E64', 'SUP-GNT-01', R('BAP'), 'Guntur-Bapatla road', 'road', 50],
  ['E65', 'SUP-GNT-01', 'SUP-VJA-01', 'Guntur-Vijayawada road', 'road', 55],
  ['E66', 'SUP-VJA-01', R('BAP'), 'Vijayawada-Bapatla road (alternate)', 'road', 45],
  ['E67', 'SUP-VJA-01', R('WGD'), 'Vijayawada-Eluru road', 'road', 55],
  ['E68', 'SUP-VJA-01', 'SUP-RJY-01', 'Vijayawada-Rajahmundry highway (NH16)', 'road', 60],
  ['E69', 'SUP-RJY-01', R('WGD'), 'Rajahmundry-West Godavari road', 'road', 50],
  ['E70', R('WGD'), R('KON'), 'West Godavari-Konaseema road (Godavari bridge)', 'road', 40],
  ['E71', 'SUP-RJY-01', R('KON'), 'Rajahmundry-Konaseema road', 'road', 40],
  ['E72', 'SUP-RJY-01', R('KAK'), 'Rajahmundry-Kakinada road', 'road', 55],
  ['E73', R('KAK'), R('KON'), 'Kakinada-Konaseema coastal road', 'road', 40],
  ['E74', R('KAK'), 'SUP-VSK-01', 'Kakinada-Visakhapatnam highway (NH16)', 'road', 60],
  ['E75', 'SUP-VSK-01', R('VSK'), 'Visakhapatnam city roads', 'road', 35],
  ['E76', 'SUP-RJY-01', 'SUP-VSK-01', 'Rajahmundry-Visakhapatnam highway', 'road', 60],
  ['E77', 'SUP-VSK-01', 'SUP-BER-01', 'Visakhapatnam-Berhampur highway (NH16)', 'road', 60],
  ['E78', 'SUP-BER-01', R('GAN'), 'Berhampur-Ganjam local roads', 'road', 40],
  ['E79', 'SUP-BER-01', 'SUP-BBS-01', 'Berhampur-Bhubaneswar highway', 'road', 60],
];

/**
 * Sample weather for the added districts. heavy = [rain1h, rain24h, rain72h, tempC, humidity, condition].
 * Moderate and dry scenarios are derived from it.
 */
const H = (a, b, c, t, h, d) => [a, b, c, t, h, d];
export const INDIA_HEAVY = {
  SPL: H(15, 165, 300, 27, 95, 'Very heavy rain'), SHS: H(12, 140, 260, 27, 94, 'Heavy intensity rain'), DBG: H(6, 70, 135, 28, 91, 'Heavy intensity rain'),
  KEN: H(14, 155, 280, 28, 95, 'Very heavy rain'), PUR: H(4, 50, 100, 29, 88, 'Moderate rain'), BAL: H(7, 80, 150, 28, 92, 'Heavy intensity rain'),
  MAL: H(6, 75, 140, 28, 91, 'Heavy intensity rain'), MUR: H(6, 70, 130, 28, 91, 'Heavy intensity rain'), S24: H(13, 150, 270, 29, 96, 'Very heavy rain'),
  ALP: H(13, 150, 290, 26, 96, 'Very heavy rain'), EKM: H(7, 85, 160, 26, 92, 'Heavy intensity rain'), IDK: H(7, 90, 170, 22, 93, 'Heavy intensity rain'),
  GKP: H(2, 25, 50, 29, 80, 'Light rain'), BAH: H(5, 70, 130, 28, 88, 'Heavy intensity rain'),
  SRT: H(7, 85, 160, 28, 91, 'Heavy intensity rain'), VAD: H(2, 30, 60, 29, 82, 'Light rain'),
  KLP: H(7, 85, 165, 24, 92, 'Heavy intensity rain'), SGL: H(3, 35, 70, 26, 85, 'Light rain'),
  BAP: H(5, 60, 110, 29, 88, 'Moderate rain'), WGD: H(5, 65, 120, 29, 89, 'Moderate rain'), KON: H(6, 75, 140, 29, 90, 'Heavy intensity rain'),
  KAK: H(5, 60, 115, 29, 88, 'Moderate rain'), VSK: H(4, 50, 100, 29, 86, 'Moderate rain'), GAN: H(5, 60, 110, 29, 88, 'Moderate rain'),
  CHN: H(7, 90, 160, 27, 91, 'Heavy intensity rain'), CUD: H(3, 35, 70, 28, 84, 'Light rain'), NGP: H(2, 25, 50, 29, 80, 'Light rain'),
};

export function extendScenarios(SCENARIOS) {
  const tuple = ([r1, r24, r72, t, h, c]) => ({ rain1h: r1, rain24h: r24, rain72h: r72, temperatureC: t, humidity: h, condition: c });
  for (const [code, v] of Object.entries(INDIA_HEAVY)) {
    SCENARIOS['heavy-rain'].regions[code] = tuple(v);
    SCENARIOS['moderate-rain'].regions[code] = tuple([Math.round(v[0] * 0.3), Math.round(v[1] * 0.3), Math.round(v[2] * 0.3), v[3] + 2, Math.max(70, v[4] - 12), 'Moderate rain']);
    SCENARIOS.dry.regions[code] = tuple([0, 1, 3, 32, 55, 'Clear sky']);
    SCENARIOS['incomplete-data'].regions[code] = tuple(v);
  }
  // Demonstrate gaps in the feed: one district without a 72 h forecast, one with no rainfall data.
  SCENARIOS['incomplete-data'].regions.SPL = { ...SCENARIOS['incomplete-data'].regions.SPL, rain72h: null };
  SCENARIOS['incomplete-data'].regions.MUR = tuple([null, null, null, null, null, null]);
  // Cyclone Arnab (sample): intense rain along the coast, dry elsewhere. Only rainfall is modelled;
  // wind and storm surge are NOT part of the risk score.
  const cyclone = {
    BAP: H(20, 210, 330, 28, 97, 'Extreme rain'), WGD: H(18, 190, 310, 28, 97, 'Very heavy rain'), KON: H(22, 230, 360, 28, 98, 'Extreme rain'),
    KAK: H(19, 200, 320, 28, 97, 'Very heavy rain'), VSK: H(14, 160, 270, 28, 95, 'Very heavy rain'), GAN: H(15, 170, 280, 28, 96, 'Very heavy rain'),
  };
  const dry = tuple([0, 1, 3, 32, 55, 'Clear sky']);
  SCENARIOS['cyclone-arnab'] = {
    label: 'Cyclone Arnab: coastal Andhra Pradesh and Odisha (sample)',
    regions: { ...Object.fromEntries(Object.keys(SCENARIOS.dry.regions).map((c) => [c, dry])), ...Object.fromEntries(Object.entries(cyclone).map(([c, v]) => [c, tuple(v)])) },
  };
}
