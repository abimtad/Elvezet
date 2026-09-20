'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import { useBusinessServices } from '@/hooks/useBusiness';
import { dashboardService } from '@/services/dashboard.service';
import { StaffStatRow } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import ListToolbar, { fieldClass } from '@/components/dashboard/ListToolbar';
import { AlertTriangle, Pencil, Plus, Trash2, Users, X, Upload, Calendar } from 'lucide-react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const SPECIALTY_OPTIONS = ['Hair', 'Beard', 'Nails', 'Color', 'Kids', 'Treatment'];

type StaffMember = {
  _id?: string;
  id?: string;
  staffId?: string;
  specialties?: string[];
  userId?: {
    fullName?: string;
    email?: string;
    firebaseUid?: string;
  };
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  permissionLevel?: 'low' | 'medium' | 'high';
  hourlyWage?: number;
  serviceCommission?: { type: 'fixed' | 'tiered'; value: number };
  productCommission?: number;
  biography?: string;
  isBookableInCalendar?: boolean;
  services?: Array<{ _id?: string; name?: string }>;
  profilePicture?: string;
  isActive?: boolean;
  isOnlineVisible?: boolean;
};

const AVATAR_COLORS = [
  'border-amber-200 bg-amber-50 text-amber-500',
  'border-emerald-200 bg-emerald-50 text-emerald-500',
  'border-sky-200 bg-sky-50 text-sky-500',
  'border-violet-200 bg-violet-50 text-violet-500',
  'border-rose-200 bg-rose-50 text-rose-500',
];

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] || AVATAR_COLORS[0];
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'ST';
}

type StaffForm = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  permissionLevel: 'low' | 'medium' | 'high';
  hourlyWage: number;
  serviceCommissionType: 'fixed' | 'tiered';
  serviceCommissionValue: number;
  productCommission: number;
  biography: string;
  isBookableInCalendar: boolean;
  specialties: string[];
  serviceIds: string[];
};

const emptyForm: StaffForm = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  role: '',
  permissionLevel: 'low',
  hourlyWage: 0,
  serviceCommissionType: 'fixed',
  serviceCommissionValue: 0,
  productCommission: 0,
  biography: '',
  isBookableInCalendar: true,
  specialties: [],
  serviceIds: [],
};

function memberKey(member: StaffMember) {
  return String(member.staffId || member.userId?.firebaseUid || '');
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

export default function StaffPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [visibilityWarning, setVisibilityWarning] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'archived' | 'bookable' | 'online'
  >('all');
  const [roleFilter, setRoleFilter] = useState('all');

  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [isSaving, setIsSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [roles, setRoles] = useState(['Barber', 'Senior Barber', 'Manager', 'Stylist', 'Junior Stylist', 'Senior Stylist', 'Founder', 'Creative Director', 'Director', 'Colourist', 'Senior Colourist', 'Nail Technician', 'Receptionist']);
  const [newRole, setNewRole] = useState('');
  useEffect(() => { setShowModal(false); setEditingKey(null); setForm(emptyForm); setImgSrc(''); setRoleFilter('all'); }, [selectedShopId]);

  const queryClient = useQueryClient();

  const { data: staffRaw, isLoading, error } = useQuery({ queryKey: ['owner-staff', selectedShopId], queryFn: () => dashboardService.getOwnerStaff(selectedShopId), enabled: !!selectedShopId });
  const { data: staffStatsRaw } = useQuery({
    queryKey: ['staff-stats', selectedShopId],
    queryFn: () => dashboardService.getStaffStats(selectedShopId),
    enabled: Boolean(selectedShopId),
    refetchInterval: 60_000,
  });
  const { data: servicesRaw } = useBusinessServices(selectedShopId);
  const staff = Array.isArray(staffRaw) ? (staffRaw as StaffMember[]) : [];
  const services = useMemo(
    () =>
      (Array.isArray(servicesRaw) ? servicesRaw : []).map((s: { _id?: string; id?: string; name?: string }) => ({
        id: String(s._id || s.id || ''),
        name: s.name || 'Service',
      })),
    [servicesRaw],
  );

  const roleOptions = useMemo(() => {
    const set = new Set(
      staff.map((m) => m.role || 'Stylist').filter(Boolean) as string[],
    );
    return ['all', ...Array.from(set).sort()];
  }, [staff]);

  const statsByStaffId = useMemo(() => {
    const map = new Map<string, StaffStatRow>();
    for (const row of staffStatsRaw || []) {
      map.set(row.staffId, row);
    }
    return map;
  }, [staffStatsRaw]);

  const filteredStaff = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return staff.filter((member) => {
      const name = member.firstName
        ? `${member.firstName} ${member.lastName || ''}`.trim()
        : member.userId?.fullName || 'Staff Member';
      const email = member.email || member.userId?.email || '';
      const role = member.role || 'Stylist';
      const inactive = member.isActive === false;
      const key = memberKey(member);
      const stats = statsByStaffId.get(key);
      const isOnline = (stats?.isOnlineVisible ?? member.isOnlineVisible) !== false;
      const isBookable = member.isBookableInCalendar !== false;

      if (roleFilter !== 'all' && role !== roleFilter) return false;
      if (statusFilter === 'active' && inactive) return false;
      if (statusFilter === 'archived' && !inactive) return false;
      if (statusFilter === 'bookable' && (inactive || !isBookable)) return false;
      if (statusFilter === 'online' && (inactive || !isOnline)) return false;
      if (!needle) return true;
      return (
        name.toLowerCase().includes(needle) ||
        email.toLowerCase().includes(needle) ||
        role.toLowerCase().includes(needle)
      );
    });
  }, [staff, search, statusFilter, roleFilter, statsByStaffId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['business-staff', selectedShopId] });
    void queryClient.invalidateQueries({ queryKey: ['owner-staff', selectedShopId] });
    void queryClient.invalidateQueries({ queryKey: ['staff-stats', selectedShopId] });
  };

  const visibilityMutation = useMutation({
    mutationFn: ({ staffId, isOnlineVisible }: { staffId: string; isOnlineVisible: boolean }) =>
      dashboardService.setStaffVisibility(selectedShopId, staffId, isOnlineVisible),
    onSuccess: () => {
      setVisibilityWarning('');
      invalidate();
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        const apiMessage = (err.response?.data as { message?: string } | undefined)?.message;
        setVisibilityWarning(apiMessage || 'Cannot update staff visibility.');
        return;
      }
      setVisibilityWarning(err instanceof Error ? err.message : 'Cannot update staff visibility.');
    },
  });

  const calendarMutation = useMutation({
    mutationFn: ({ staffId, isBookableInCalendar }: { staffId: string; isBookableInCalendar: boolean }) =>
      dashboardService.updateStaff(selectedShopId, staffId, { isBookableInCalendar }),
    onSuccess: () => invalidate(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => dashboardService.createStaff(selectedShopId, payload),
    onSuccess: () => {
      setShowModal(false);
      setEditingKey(null);
      setForm(emptyForm);
      setImgSrc('');
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: Record<string, unknown> }) =>
      dashboardService.updateStaff(selectedShopId, key, payload),
    onSuccess: () => {
      setShowModal(false);
      setEditingKey(null);
      setForm(emptyForm);
      setImgSrc('');
      invalidate();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (key: string) => dashboardService.archiveStaff(selectedShopId, key),
    onSuccess: invalidate,
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingKey(null);
    setImgSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setShowModal(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditingKey(memberKey(member));
    setForm({
      firstName: member.firstName || member.userId?.fullName?.split(' ')[0] || '',
      lastName: member.lastName || member.userId?.fullName?.split(' ').slice(1).join(' ') || '',
      email: member.email || member.userId?.email || '',
      phoneNumber: '',
      role: member.role || '',
      permissionLevel: member.permissionLevel || 'low',
      hourlyWage: member.hourlyWage || 0,
      serviceCommissionType: member.serviceCommission?.type || 'fixed',
      serviceCommissionValue: member.serviceCommission?.value || 0,
      productCommission: member.productCommission || 0,
      biography: member.biography || '',
      isBookableInCalendar: member.isBookableInCalendar !== false,
      specialties: member.specialties || [],
      serviceIds: (member.services || []).map((s) => String(s._id || '')).filter(Boolean),
    });
    setImgSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setShowModal(true);
  };

  const toggleSpecialty = (value: string) => {
    setForm((state) => ({
      ...state,
      specialties: state.specialties.includes(value)
        ? state.specialties.filter((item) => item !== value)
        : [...state.specialties, value],
    }));
  };

  const toggleService = (id: string) => {
    setForm((state) => ({
      ...state,
      serviceIds: state.serviceIds.includes(id)
        ? state.serviceIds.filter((item) => item !== id)
        : [...state.serviceIds, id],
    }));
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined);
      setCompletedCrop(undefined);
      const reader = new FileReader();
      reader.addEventListener('load', () => setImgSrc(reader.result?.toString() || ''));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerAspectCrop(width, height, 1);
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  };

  const handleSubmit = async () => {
    const payload = {
      fullName: `${form.firstName} ${form.lastName}`.trim(),
      email: form.email.trim(),
      phoneNumber: form.phoneNumber.trim() || undefined,
      role: form.role,
      permissionLevel: form.permissionLevel,
      hourlyWage: form.hourlyWage,
      serviceCommission: { type: form.serviceCommissionType, value: form.serviceCommissionValue },
      productCommission: form.productCommission,
      biography: form.biography,
      isBookableInCalendar: form.isBookableInCalendar,
      specialties: form.specialties,
      services: form.serviceIds.length === 0 ? services.map(s => s.id) : form.serviceIds,
    };

    if (!editingKey && (!form.firstName.trim() || !form.email.trim())) {
      alert("First name and email are required");
      return;
    }

    setIsSaving(true);
    try {
      let finalStaffId = editingKey;

      if (editingKey) {
        await dashboardService.updateStaff(selectedShopId, editingKey, { ...payload, isActive: staff.find(member => memberKey(member) === editingKey)?.isActive !== false });
      } else {
        const createdStaff: any = await dashboardService.createStaff(selectedShopId, payload);
        finalStaffId = createdStaff?.staffId || createdStaff?._id || createdStaff?.id;
      }

      if (imgSrc && completedCrop && imgRef.current && finalStaffId) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
          const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
          canvas.width = completedCrop.width;
          canvas.height = completedCrop.height;
          ctx.drawImage(
            imgRef.current,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            completedCrop.width,
            completedCrop.height
          );

          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg'));
          if (blob) {
            await dashboardService.uploadStaffAvatar(selectedShopId, finalStaffId, blob);
          }
        }
      }

      setShowModal(false);
      setEditingKey(null);
      setForm(emptyForm);
      setImgSrc('');
      setCrop(undefined);
      setCompletedCrop(undefined);
      invalidate();
    } catch (err) {
      console.error(err);
      alert("An error occurred while saving the staff profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = (member: StaffMember) => {
    const key = memberKey(member);
    const name = member.firstName || member.userId?.fullName || 'this staff member';
    if (!key || !window.confirm(`Archive ${name}? They will be marked inactive.`)) return;
    archiveMutation.mutate(key);
  };

  const handleAddRole = () => {
    if (newRole && !roles.includes(newRole)) {
      setRoles([...roles, newRole]);
      setForm({ ...form, role: newRole });
      setNewRole('');
    }
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Team"
        title="Staff Management"
        description="Add barbers, assign specialties, manage payroll, and configure visibility."
        actions={
          <>
            <ShopSelector selectedShopId={selectedShopId} onSelect={setSelectedShopId} />
            {selectedShopId ? (
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 rounded-full bg-[#111b65] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a2578]"
              >
                <Plus className="h-4 w-4" />
                Add Staff
              </button>
            ) : null}
          </>
        }
      />

      {visibilityWarning ? (
        <div className="mb-4 flex items-start gap-2 border-l-2 border-amber-400 py-2 pl-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {visibilityWarning}
        </div>
      ) : null}

      {!selectedShopId ? (
        <div className="rounded-[28px] border border-[#eceff3] bg-white p-12 text-center text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          Select a shop to view its staff.
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-3xl bg-slate-200" />
          ))}
        </div>
      ) : error ? (
        <p className="py-10 text-center text-sm text-rose-600">
          Error loading staff. Please try again.
        </p>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="mb-4 h-10 w-10 text-slate-400" />
          <p className="text-slate-500">No staff members found for this shop.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search name, email, or role…"
            countLabel={`${filteredStaff.length} of ${staff.length}`}
            chips={[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'bookable', label: 'On calendar' },
              { id: 'online', label: 'Bookable online' },
              { id: 'archived', label: 'Archived' },
            ]}
            activeChip={statusFilter}
            onChip={(id) => setStatusFilter(id as typeof statusFilter)}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-400">Role</span>
            {roleOptions.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={cn(
                  'font-medium',
                  roleFilter === role
                    ? 'text-[#111b65] underline underline-offset-8'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {role === 'all' ? 'All roles' : role}
              </button>
            ))}
          </div>

          {filteredStaff.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No staff match these filters.
            </p>
          ) : null}

        <div className="overflow-hidden">
          {/* Table - Desktop Only */}
          <div className="hidden lg:block">
            {/* Table Header */}
            <div className="grid grid-cols-[2fr_1.5fr_2fr_120px_140px_100px] gap-4 px-1 py-3 border-b border-slate-200 text-xs font-medium text-slate-400 uppercase tracking-wider">
              <div>Staff</div>
              <div>Role</div>
              <div>Email</div>
              <div>Calendar</div>
              <div>Online Booking</div>
              <div className="text-center">Action</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-slate-100">
              {filteredStaff.map((member) => {
                const id = String(member._id || member.id || member.staffId || '');
                const name = member.firstName ? `${member.firstName} ${member.lastName || ''}`.trim() : member.userId?.fullName || 'Staff Member';
                const email = member.email || member.userId?.email || '';
                const role = member.role || 'Stylist';
                const inactive = member.isActive === false;
                const color = avatarColor(name);
                const key = memberKey(member);
                const stats = statsByStaffId.get(key);
                const isOnline = (stats?.isOnlineVisible ?? member.isOnlineVisible) !== false;
                const isBookable = member.isBookableInCalendar !== false;

                return (
                  <div
                    key={id}
                    className={cn(
                      'grid grid-cols-[2fr_1.5fr_2fr_120px_140px_100px] gap-4 px-1 py-4 items-center hover:bg-slate-50/80 transition-colors',
                      inactive && 'opacity-50'
                    )}
                  >
                  {/* Staff Column - Avatar + Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    {member.profilePicture ? (
                      <img
                        src={member.profilePicture}
                        alt={name}
                        className="h-10 w-10 rounded-full object-cover shadow-sm border border-slate-200 flex-shrink-0"
                      />
                    ) : (
                      <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold', color)}>
                        {initials(name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900 text-sm">{name}</div>
                      {stats && (
                        <div className="truncate text-xs text-slate-500">
                          {stats.totalServicesProvided} services • {stats.totalHoursWorked}h this week
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role Column */}
                  <div className="text-sm text-slate-700">{role}</div>

                  {/* Email Column */}
                  <div className="text-sm text-slate-600 truncate">{email}</div>

                  {/* Calendar Toggle */}
                  <div className="flex items-center justify-center">
                    {!inactive && key ? (
                      <button
                        type="button"
                        onClick={() => calendarMutation.mutate({ staffId: key, isBookableInCalendar: !isBookable })}
                        className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
                        title={isBookable ? 'Bookable in calendar' : 'Not bookable'}
                      >
                        <div className={cn("h-2.5 w-2.5 rounded-full", isBookable ? "bg-emerald-500" : "bg-slate-300")} />
                        <span className={isBookable ? "text-emerald-600" : "text-slate-500"}>
                          {isBookable ? 'Active' : 'Hidden'}
                        </span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>

                  {/* Online Booking Toggle */}
                  <div className="flex items-center justify-center">
                    {!inactive && key ? (
                      <button
                        type="button"
                        onClick={() => visibilityMutation.mutate({ staffId: key, isOnlineVisible: !isOnline })}
                        className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
                        title={isOnline ? 'Visible online' : 'Hidden from online booking'}
                      >
                        <div className={cn("h-2.5 w-2.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-slate-300")} />
                        <span className={isOnline ? "text-emerald-600" : "text-slate-500"}>
                          {isOnline ? 'Visible' : 'Hidden'}
                        </span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>

                  {/* Action Dropdown */}
                  <div className="flex items-center justify-center gap-1">
                    {!inactive ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(member)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                          title="Edit staff member"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(member)}
                          className="rounded-lg border border-rose-200 p-1.5 text-rose-500 hover:bg-rose-50 transition"
                          title="Archive staff member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Archived</span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {/* Mobile/Tablet Card View */}
          <div className="lg:hidden divide-y divide-slate-100">
            {filteredStaff.map((member) => {
              const id = String(member._id || member.id || member.staffId || '');
              const name = member.firstName ? `${member.firstName} ${member.lastName || ''}`.trim() : member.userId?.fullName || 'Staff Member';
              const email = member.email || member.userId?.email || '';
              const role = member.role || 'Stylist';
              const inactive = member.isActive === false;
              const color = avatarColor(name);
              const key = memberKey(member);
              const stats = statsByStaffId.get(key);
              const isOnline = (stats?.isOnlineVisible ?? member.isOnlineVisible) !== false;
              const isBookable = member.isBookableInCalendar !== false;

              return (
                <div key={id} className={cn('p-4 hover:bg-slate-50 transition-colors', inactive && 'opacity-50')}>
                  <div className="flex items-start gap-3">
                    {member.profilePicture ? (
                      <img src={member.profilePicture} alt={name} className="h-12 w-12 rounded-full object-cover shadow-sm border border-slate-200 flex-shrink-0" />
                    ) : (
                      <div className={cn('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold', color)}>
                        {initials(name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{name}</div>
                      <div className="text-sm text-slate-600">{role}</div>
                      <div className="text-xs text-slate-500 truncate">{email}</div>
                      <div className="flex items-center gap-2 mt-2">
                        {!inactive && key ? (
                          <>
                            <button
                              type="button"
                              onClick={() => calendarMutation.mutate({ staffId: key, isBookableInCalendar: !isBookable })}
                              className="inline-flex items-center gap-1 text-xs"
                            >
                              <div className={cn("h-2 w-2 rounded-full", isBookable ? "bg-emerald-500" : "bg-slate-300")} />
                              <span>{isBookable ? 'Calendar' : 'Hidden'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => visibilityMutation.mutate({ staffId: key, isOnlineVisible: !isOnline })}
                              className="inline-flex items-center gap-1 text-xs"
                            >
                              <div className={cn("h-2 w-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-slate-300")} />
                              <span>{isOnline ? 'Online' : 'Hidden'}</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {!inactive ? (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(member)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => handleArchive(member)} className="rounded-lg border border-rose-200 p-1.5 text-rose-500 hover:bg-rose-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {showModal && selectedShopId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col bg-white shadow-xl">
            {/* Modal Header */}
            <div className="shrink-0 border-b border-slate-100 px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{editingKey ? 'Edit Staff Profile' : 'Staff'}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {editingKey ? 'Update staff member details and permissions' : 'Create and edit staff profiles, add to calendar and online booking, set permissions and commissions'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingKey(null); setForm(emptyForm); setImgSrc(''); }}
                  className="p-2 text-slate-400 transition hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Single Scrollable Form - No Tabs */}
            <div className="overflow-y-auto flex-1 px-8 py-6 space-y-8">

              {/* Section 1: Identity & Avatar */}
              <div className="space-y-5">
                <div className="flex items-start gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">First Name <span className="text-rose-500">*</span></label>
                        <input
                          value={form.firstName}
                          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                          placeholder="Enter staff first name"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                        <input
                          value={form.lastName}
                          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                          placeholder="Enter staff last name"
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Role <span className="text-rose-500">*</span></label>
                      <select
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className={fieldClass}
                      >
                        <option value="">Choose Role</option>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Or add new role</label>
                        <input
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          placeholder="New role name"
                          className={fieldClass}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddRole}
                        className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200 transition"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {/* Avatar Upload */}
                  <div className="w-40 flex flex-col items-center shrink-0">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Avatar</label>
                    <div className="h-28 w-28 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50 relative group hover:border-[#111b65] transition-colors">
                      {imgSrc ? (
                        <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} aspect={1} circularCrop>
                          <img ref={imgRef} src={imgSrc} onLoad={onImageLoad} alt="Avatar crop" className="w-full h-full object-cover" />
                        </ReactCrop>
                      ) : (
                        <Upload className="h-7 w-7 text-slate-400 group-hover:text-[#111b65] transition" />
                      )}
                      <input type="file" accept="image/*" onChange={onSelectFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-center">Upload</p>
                  </div>
                </div>
              </div>

              {/* Section 2: Give Staff Access (Zolmi Style) */}
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Give Staff Access To Platform</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Allow staff to manage their calendar. Add email and choose permission level. We will send them a link to create their account
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Email <span className="text-rose-500">*</span></label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="Enter email"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Permission Levels</label>
                    <select
                      value={form.permissionLevel}
                      onChange={(e) => setForm({ ...form, permissionLevel: e.target.value as any })}
                      className={fieldClass}
                    >
                      <option value="low">No Access</option>
                      <option value="low">Low (Own schedule only)</option>
                      <option value="medium">Medium (View all, manage own)</option>
                      <option value="high">High (Full shop admin)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phoneNumber}
                    onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                    placeholder="+1 234 567 8900"
                    className={fieldClass}
                  />
                </div>
              </div>

              {/* Section 3: Service Commissions & Payroll */}
              <div className="space-y-5 border-t border-slate-100 pt-6">
                <h3 className="text-base font-semibold text-slate-900">Service Commissions</h3>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Service Commissions</p>
                    <p className="text-xs text-slate-500 mt-0.5">Compensation is calculated as a percentage of service sales (net)</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.serviceCommissionValue > 0}
                      onChange={(e) => setForm({ ...form, serviceCommissionValue: e.target.checked ? 10 : 0 })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#111b65]"></div>
                  </label>
                </div>

                {form.serviceCommissionValue > 0 && (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="commType"
                          checked={form.serviceCommissionType === 'fixed'}
                          onChange={() => setForm({ ...form, serviceCommissionType: 'fixed' })}
                          className="text-[#111b65] focus:ring-[#111b65]"
                        />
                        Fixed Percentage
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="commType"
                          checked={form.serviceCommissionType === 'tiered'}
                          onChange={() => setForm({ ...form, serviceCommissionType: 'tiered' })}
                          className="text-[#111b65] focus:ring-[#111b65]"
                        />
                        Tiered
                      </label>
                    </div>
                    {form.serviceCommissionType === 'fixed' && (
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Commission Percentage (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={form.serviceCommissionValue}
                          onChange={(e) => setForm({ ...form, serviceCommissionValue: parseFloat(e.target.value) || 0 })}
                          className={fieldClass}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Payroll</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Hourly Wage</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={form.hourlyWage}
                        onChange={(e) => setForm({ ...form, hourlyWage: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Product Commission</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={form.productCommission}
                        onChange={(e) => setForm({ ...form, productCommission: parseFloat(e.target.value) || 0 })}
                        placeholder="0%"
                        className={fieldClass}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Booking Settings */}
              <div className="space-y-4 border-t border-slate-100 pt-6">
                <h3 className="text-base font-semibold text-slate-900">Booking</h3>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Add to Calendar</p>
                    <p className="text-xs text-slate-500 mt-0.5">Make staff bookable in your calendar</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isBookableInCalendar}
                      onChange={(e) => setForm({ ...form, isBookableInCalendar: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#111b65]"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Enable Online Booking</p>
                    <p className="text-xs text-slate-500 mt-0.5">Make staff available for clients on your booking page</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#111b65] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                  </label>
                </div>
              </div>

              {/* Section 5: Staff Biography & Marketing */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Staff Biography</label>
                  <textarea
                    value={form.biography}
                    onChange={(e) => setForm({ ...form, biography: e.target.value })}
                    rows={6}
                    placeholder="Write a professional bio that will appear in the mobile app. Highlight experience, specialties, and what makes this staff member unique..."
                    className={fieldClass + " resize-none"}
                  />
                  <p className="text-xs text-slate-500 mt-1.5">This biography will be visible to customers in the Flutter booking app.</p>
                </div>
              </div>

              {/* Section 6: Specialties & Services */}
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Specialties</label>
                  <div className="flex flex-wrap gap-2">
                    {SPECIALTY_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleSpecialty(opt)}
                        className={cn(
                          'px-2 py-1.5 text-sm font-medium transition',
                          form.specialties.includes(opt)
                            ? 'text-[#111b65] underline decoration-2 underline-offset-8'
                            : 'text-slate-500 hover:text-slate-800',
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Provided Services</label>
                  <div className="max-h-60 space-y-1 overflow-y-auto border-t border-slate-100 pt-3">
                    {services.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No services available. Add services first.</p>
                    ) : (
                      services.map((svc) => (
                        <label
                          key={svc.id}
                          className="flex cursor-pointer items-center gap-3 text-sm text-slate-700 p-2.5 hover:bg-white rounded-lg transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={form.serviceIds.includes(svc.id)}
                            onChange={() => toggleService(svc.id)}
                            className="w-4 h-4 rounded text-[#111b65] border-slate-300 focus:ring-[#111b65]"
                          />
                          <span>{svc.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">Select all services this staff member can provide.</p>
                </div>
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="shrink-0 border-t border-slate-100 px-8 py-5">
              <div className="flex items-center justify-end gap-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingKey(null); setForm(emptyForm); setImgSrc(''); }}
                  className="px-2 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="bg-[#111b65] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a2578] disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : (editingKey ? 'Save Changes' : 'Create Staff Member')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
