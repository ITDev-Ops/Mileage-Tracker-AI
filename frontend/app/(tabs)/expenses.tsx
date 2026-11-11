import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Modal, TextInput, ScrollView, Image
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const EXPENSE_CATEGORIES = [
  { key: 'fuel', label: 'Fuel', icon: 'droplet', color: '#F59E0B' },
  { key: 'parking', label: 'Parking', icon: 'map-pin', color: '#38BDF8' },
  { key: 'maintenance', label: 'Maintenance', icon: 'tool', color: '#F43F5E' },
  { key: 'meals', label: 'Meals', icon: 'coffee', color: '#A78BFA' },
  { key: 'other', label: 'Other', icon: 'tag', color: '#94A3B8' },
];

const FILTER_CATEGORIES = [
  { key: 'all', label: 'All', icon: 'layers', color: Colors.brand.primary },
  ...EXPENSE_CATEGORIES,
];

const CATEGORIES = EXPENSE_CATEGORIES;

const ExpenseItem = memo(({ item, onPress, onDelete }: { item: any, onPress: (item: any) => void, onDelete: (id: string) => void }) => {
  const catColor = (cat: string) => CATEGORIES.find(c => c.key === cat)?.color || Colors.text.tertiary;
  const catIcon = (cat: string) => CATEGORIES.find(c => c.key === cat)?.icon || 'tag';
  return (
    <TouchableOpacity testID={`expense-${item.expense_id}`} onPress={() => onPress(item)} activeOpacity={0.7} style={styles.expenseRow}>
      <View style={[styles.expenseIcon, { backgroundColor: catColor(item.category) + '20' }]}>
        <Feather name={catIcon(item.category) as any} size={18} color={catColor(item.category)} />
      </View>
      <View style={styles.expenseInfo}>
        <Text style={styles.expenseMerchant}>{item.merchant}</Text>
        <Text style={styles.expenseMeta}>{item.category} · {new Date(item.created_at).toLocaleDateString()}</Text>
      </View>
      <View style={styles.expenseRight}>
        <Text style={styles.expenseAmount}>${item.amount.toFixed(2)}</Text>
        <TouchableOpacity testID={`delete-expense-${item.expense_id}`} onPress={() => onDelete(item.expense_id)}>
          <Feather name="trash-2" size={16} color={Colors.text.tertiary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});


export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({ merchant: '', amount: '', category: 'other', notes: '', receipt_date: '', receipt_number: '', receipt_phone: '' });
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (zoomImage) {
      setZoomScale(1.0);
    }
  }, [zoomImage]);

  const loadExpenses = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.getExpenses(token);
      setExpenses(data);
    } catch (e: any) {
      console.log('[Expenses] Load expenses error:', e.message || e);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadExpenses().finally(() => setLoading(false));
  }, [loadExpenses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExpenses();
    setRefreshing(false);
  };

  const handleScanReceipt = async () => {
    if (user?.subscription_tier === 'free') {
      Alert.alert(
        'Upgrade Required',
        'Receipt scanning is a premium feature. Please upgrade your plan to Pro or Business to scan receipts.',
        [
          { text: 'Upgrade Now', onPress: () => router.push('/subscription') },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    try {
      let base64: string | null = null;
      let selectedUri: string | null = null;
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        const galleryResult = await ImagePicker.launchImageLibraryAsync({
          quality: 0.9,
          allowsEditing: true
        });
        if (galleryResult.canceled || !galleryResult.assets[0]?.uri) return;
        selectedUri = galleryResult.assets[0].uri;
      } else {
        const cameraResult = await ImagePicker.launchCameraAsync({
          quality: 0.9,
          allowsEditing: true
        });
        if (cameraResult.canceled || !cameraResult.assets[0]?.uri) return;
        selectedUri = cameraResult.assets[0].uri;
      }

      if (!selectedUri) return;

      console.log('[Expenses] Resizing and compressing picked receipt image...');
      const manipResult = await ImageManipulator.manipulateAsync(
        selectedUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      base64 = manipResult.base64 || null;
      if (!base64) return;

      setScanning(true);
      const scanResult = await API.scanReceipt(token!, base64);
      const hasExtractedData = scanResult.extracted && 
        (scanResult.extracted.merchant !== 'Unknown' || (scanResult.extracted.amount && parseFloat(scanResult.extracted.amount) > 0));

      if (scanResult.success && hasExtractedData && !scanResult.fallback) {
        setForm({
          merchant: scanResult.extracted.merchant || '',
          amount: scanResult.extracted.amount?.toString() || '',
          category: scanResult.extracted.category || 'other',
          notes: '',
          receipt_date: scanResult.extracted.date || '',
          receipt_number: scanResult.extracted.receipt_number || '',
          receipt_phone: scanResult.extracted.receipt_phone || ''
        });
        setScannedImage(base64);
        setShowAdd(true);
      } else {
        Alert.alert('Scan Result', 'Could not extract receipt data. Please enter manually.');
        setForm({
          merchant: '',
          amount: '',
          category: 'other',
          notes: '',
          receipt_date: new Date().toISOString().split('T')[0],
          receipt_number: '',
          receipt_phone: ''
        });
        setScannedImage(base64);
        setShowAdd(true);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not scan receipt');
    } finally {
      setScanning(false);
    }
  };

  const handleEditExpense = useCallback(async (expense: any) => {
    setEditingExpenseId(expense.expense_id);
    setForm({
      merchant: expense.merchant,
      amount: expense.amount.toString(),
      category: expense.category,
      notes: expense.notes || '',
      receipt_date: expense.receipt_date || '',
      receipt_number: expense.receipt_number || '',
      receipt_phone: expense.receipt_phone || ''
    });
    setScannedImage(null);
    setShowAdd(true);

    try {
      const fullExpense = await API.getExpense(token!, expense.expense_id);
      if (fullExpense.receipt_base64) {
        setScannedImage(fullExpense.receipt_base64);
      }
    } catch (e: any) {
      console.warn("Could not load receipt image:", e.message);
    }
  }, [token]);

  const handleAddExpense = async () => {
    if (!form.amount || isNaN(parseFloat(form.amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    try {
      if (editingExpenseId) {
        await API.updateExpense(token!, editingExpenseId, {
          merchant: form.merchant || 'Unknown',
          amount: parseFloat(form.amount),
          category: form.category,
          notes: form.notes,
          receipt_date: form.receipt_date,
          receipt_number: form.receipt_number,
          receipt_phone: form.receipt_phone
        });
      } else {
        await API.createExpense(token!, {
          merchant: form.merchant || 'Unknown',
          amount: parseFloat(form.amount),
          category: form.category,
          notes: form.notes,
          receipt_base64: scannedImage,
          receipt_date: form.receipt_date,
          receipt_number: form.receipt_number,
          receipt_phone: form.receipt_phone
        });
      }
      setShowAdd(false);
      setEditingExpenseId(null);
      setForm({ merchant: '', amount: '', category: 'other', notes: '', receipt_date: '', receipt_number: '', receipt_phone: '' });
      setScannedImage(null);
      await loadExpenses();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = useCallback((expenseId: string) => {
    Alert.alert('Delete Expense', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await API.deleteExpense(token!, expenseId); await loadExpenses(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  }, [token, loadExpenses]);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + (e.amount || 0), 0), [expenses]);
  
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = { all: 0 };
    EXPENSE_CATEGORIES.forEach(c => (totals[c.key] = 0));
    expenses.forEach(e => {
      totals.all = (totals.all || 0) + (e.amount || 0);
      const cat = (e.category || 'other').toLowerCase();
      if (totals[cat] !== undefined) {
        totals[cat] += e.amount || 0;
      } else {
        totals.other = (totals.other || 0) + (e.amount || 0);
      }
    });
    return totals;
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    if (selectedCategory === 'all') return expenses;
    return expenses.filter(e => (e.category || '').toLowerCase() === selectedCategory);
  }, [expenses, selectedCategory]);

  const renderExpenseItem = useCallback(({ item }: { item: any }) => (
    <ExpenseItem item={item} onPress={handleEditExpense} onDelete={handleDelete} />
  ), [handleEditExpense, handleDelete]);

  const ListEmpty = useCallback(() => (
    <View style={styles.empty}>
      <Feather name="credit-card" size={48} color={Colors.text.tertiary} />
      <Text style={styles.emptyTitle}>
        {selectedCategory === 'all' ? 'No expenses yet' : `No ${selectedCategory} expenses`}
      </Text>
      <Text style={styles.emptyText}>
        {selectedCategory === 'all'
          ? 'Tap "Scan" to scan a receipt or "+" to add manually'
          : `Switch category filter or add a new ${selectedCategory} expense`}
      </Text>
    </View>
  ), [selectedCategory]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Expenses</Text>
          <Text style={styles.totalLabel}>Total: <Text style={styles.totalAmount}>${total.toFixed(2)}</Text></Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity testID="scan-receipt-btn" style={styles.scanBtn} onPress={handleScanReceipt} disabled={scanning}>
            {scanning ? <ActivityIndicator size="small" color={Colors.brand.primary} /> : (
              <><Feather name="camera" size={16} color={Colors.brand.primary} /><Text style={styles.scanBtnText}>Scan</Text></>
            )}
          </TouchableOpacity>
          <TouchableOpacity testID="add-expense-btn" style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Feather name="plus" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Summary / Filter Bar with well-defined pill cards */}
      <View style={styles.catScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={styles.catScrollContent}
        >
          {FILTER_CATEGORIES.map(cat => {
            const catTotal = categoryTotals[cat.key] || 0;
            const isActive = selectedCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                testID={`expense-filter-${cat.key}`}
                activeOpacity={0.75}
                onPress={() => setSelectedCategory(isActive && cat.key !== 'all' ? 'all' : cat.key)}
                style={[
                  styles.catChip,
                  isActive
                    ? { borderColor: cat.color, backgroundColor: cat.color + '22' }
                    : { borderColor: '#2E323B', backgroundColor: '#18181B' },
                ]}
              >
                <View style={[styles.catIconWrap, { backgroundColor: cat.color + '28' }]}>
                  <Feather name={cat.icon as any} size={13} color={cat.color} />
                </View>
                <Text
                  style={[
                    styles.catChipText,
                    isActive ? { color: '#FFFFFF', fontWeight: '700' } : { color: '#F1F5F9' },
                  ]}
                >
                  {cat.label}
                </Text>
                <View
                  style={[
                    styles.catAmountBadge,
                    isActive
                      ? { backgroundColor: cat.color + '38' }
                      : { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
                  ]}
                >
                  <Text
                    style={[
                      styles.catAmountBadgeText,
                      isActive ? { color: '#FFFFFF' } : { color: '#E2E8F0' },
                    ]}
                  >
                    ${catTotal.toFixed(0)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.brand.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredExpenses}
          keyExtractor={item => item.expense_id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand.primary} />}
          renderItem={renderExpenseItem}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingTop: 8, paddingBottom: 100 }}
        />
      )}

      {/* Add Expense Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingExpenseId ? 'Edit Expense' : (scannedImage ? 'Receipt Scanned ✓' : 'Add Expense')}</Text>
            <TouchableOpacity testID="close-modal" onPress={() => { setShowAdd(false); setEditingExpenseId(null); setScannedImage(null); setForm({ merchant: '', amount: '', category: 'other', notes: '', receipt_date: '', receipt_number: '', receipt_phone: '' }); }}>
              <Feather name="x" size={24} color={Colors.text.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {scannedImage && (
              <View style={styles.thumbnailContainer}>
                <Text style={styles.formLabel}>Scanned Receipt Snapshot</Text>
                <TouchableOpacity onPress={() => setZoomImage(true)} style={styles.thumbnailWrapper}>
                  <Image source={{ uri: `data:image/jpeg;base64,${scannedImage}` }} style={styles.thumbnail} />
                  <View style={styles.thumbnailOverlay}>
                    <Feather name="maximize-2" size={12} color="#FFF" />
                    <Text style={styles.thumbnailOverlayText}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Merchant</Text>
              <TextInput testID="expense-merchant-input" style={styles.formInput} value={form.merchant} onChangeText={v => setForm(p => ({ ...p, merchant: v }))} placeholder="Store or merchant name" placeholderTextColor={Colors.text.tertiary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Amount ($)</Text>
              <TextInput testID="expense-amount-input" style={styles.formInput} value={form.amount} onChangeText={v => setForm(p => ({ ...p, amount: v }))} placeholder="0.00" placeholderTextColor={Colors.text.tertiary} keyboardType="decimal-pad" />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Receipt Date</Text>
              <TextInput testID="expense-date-input" style={styles.formInput} value={form.receipt_date} onChangeText={v => setForm(p => ({ ...p, receipt_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.text.tertiary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Receipt / Invoice / Order / Transaction / Car / Ticket #</Text>
              <TextInput testID="expense-number-input" style={styles.formInput} value={form.receipt_number} onChangeText={v => setForm(p => ({ ...p, receipt_number: v }))} placeholder="Invoice or Receipt #" placeholderTextColor={Colors.text.tertiary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Merchant Phone Number</Text>
              <TextInput testID="expense-phone-input" style={styles.formInput} value={form.receipt_phone} onChangeText={v => setForm(p => ({ ...p, receipt_phone: v }))} placeholder="Merchant Phone #" placeholderTextColor={Colors.text.tertiary} keyboardType="phone-pad" />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Category</Text>
              <View style={styles.catOptions}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    testID={`cat-${cat.key}`}
                    style={[styles.catOption, form.category === cat.key && { backgroundColor: cat.color + '30', borderColor: cat.color }]}
                    onPress={() => setForm(p => ({ ...p, category: cat.key }))}
                  >
                    <Feather name={cat.icon as any} size={14} color={form.category === cat.key ? cat.color : Colors.text.tertiary} />
                    <Text style={[styles.catOptionText, form.category === cat.key && { color: cat.color }]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Notes (optional)</Text>
              <TextInput testID="expense-notes-input" style={[styles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]} value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} placeholder="Additional notes..." placeholderTextColor={Colors.text.tertiary} multiline />
            </View>
            <TouchableOpacity testID="save-expense-btn" style={styles.saveBtn} onPress={handleAddExpense}>
              <Text style={styles.saveBtnText}>{editingExpenseId ? 'Save Changes' : 'Save Expense'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Image Zoom Modal */}
      <Modal visible={zoomImage} transparent={true} animationType="fade" onRequestClose={() => setZoomImage(false)}>
        <View style={styles.zoomContainer}>
          {/* Clickable background */}
          <TouchableOpacity 
            activeOpacity={1} 
            style={StyleSheet.absoluteFill} 
            onPress={() => setZoomImage(false)} 
          />
          
          <TouchableOpacity style={styles.zoomCloseBtn} onPress={() => setZoomImage(false)}>
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
          
          {scannedImage && (
            <Image 
              source={{ uri: `data:image/jpeg;base64,${scannedImage}` }} 
              style={[styles.zoomImage, { transform: [{ scale: zoomScale }] }]} 
              resizeMode="contain" 
            />
          )}

          {/* Zoom controls floating bar */}
          <View style={styles.zoomControls}>
            <TouchableOpacity 
              style={styles.zoomControlBtn} 
              onPress={() => setZoomScale(s => Math.max(0.5, s - 0.25))}
            >
              <Feather name="minus" size={20} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.zoomScaleText}>{Math.round(zoomScale * 100)}%</Text>
            <TouchableOpacity 
              style={styles.zoomControlBtn} 
              onPress={() => setZoomScale(s => Math.min(4.0, s + 0.25))}
            >
              <Feather name="plus" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md },
  title: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  totalLabel: { color: Colors.text.secondary, fontSize: FontSize.sm },
  totalAmount: { color: Colors.brand.primary, fontWeight: '700' },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.brand.primary + '40', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.brand.primaryDim },
  scanBtnText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  catScrollWrap: { marginBottom: 12 },
  catScroll: {},
  catScrollContent: { paddingHorizontal: Spacing.screen, gap: 10, paddingVertical: 4, alignItems: 'center' },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  catIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catChipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  catAmountBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catAmountBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  expenseIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expenseInfo: { flex: 1 },
  expenseMerchant: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '600' },
  expenseMeta: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginTop: 2, textTransform: 'capitalize' },
  expenseRight: { alignItems: 'flex-end', gap: 4 },
  expenseAmount: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  emptyText: { color: Colors.text.tertiary, fontSize: FontSize.sm, textAlign: 'center', paddingHorizontal: 32 },
  modalContainer: { flex: 1, backgroundColor: Colors.bg.primary },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  modalScroll: { flex: 1, padding: Spacing.screen },
  formGroup: { marginBottom: 18 },
  formLabel: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: 8 },
  formInput: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text.primary, fontSize: FontSize.base },
  catOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg.secondary },
  catOptionText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600' },
  saveBtn: { backgroundColor: Colors.brand.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 40 },
  saveBtnText: { color: Colors.text.inverse, fontSize: FontSize.base, fontWeight: '700' },
  thumbnailContainer: { marginBottom: 18 },
  thumbnailWrapper: { width: 120, height: 160, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.bg.secondary, borderWidth: 1, borderColor: Colors.border, position: 'relative' },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  thumbnailOverlayText: { color: '#FFF', fontSize: 10, fontWeight: '600' },
  zoomContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  zoomCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  zoomImage: { width: '90%', height: '80%' },
  zoomControls: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  zoomControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  zoomScaleText: {
    color: '#FFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'center'
  },
});
