"use client";

import React, { useRef, useState } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/services/admin.service";
import CategoryCombobox from "@/components/CategoryCombobox";

type FormState = {
  shopName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerPhoneNumber: string;
  businessCategoryId: string;
  genderTarget: string;
  latitude: string;
  longitude: string;
  addressString: string;
  bufferRange: string;
  travelRate: string;
  minTravelFee: string;
  idNumber: string;
};

const emptyForm: FormState = {
  shopName: "",
  ownerEmail: "",
  ownerPassword: "",
  ownerPhoneNumber: "",
  businessCategoryId: "",
  genderTarget: "",
  latitude: "8.9906",
  longitude: "38.7578",
  addressString: "Bole, Addis Ababa",
  bufferRange: "7",
  travelRate: "200",
  minTravelFee: "100",
  idNumber: "",
};

export default function OnboardPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [tenantType, setTenantType] = useState<"shop" | "independent">("shop");
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [smsRequested, setSmsRequested] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ["business-categories"],
    queryFn: adminService.listCategories,
  });

  const updateField = (key: keyof FormState, value: string) => {
    setForm((state) => ({ ...state, [key]: value }));
  };

  const handleFile = (file?: File | null) => {
    if (!file) return;
    setIdCardFile(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (tenantType === "independent" && !idCardFile) {
      setMessage("Please upload the ID card photo for an independent barber.");
      return;
    }
    if (!form.businessCategoryId) {
      setMessage("Please select a business category.");
      return;
    }
    if (!["male", "female", "all"].includes(form.genderTarget)) {
      setMessage("Please choose who this business serves: Men, Women, or Everyone.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        smsRequested,
        name: form.shopName,
        ownerEmail: form.ownerEmail,
        ownerPassword: form.ownerPassword,
        ownerPhoneNumber: form.ownerPhoneNumber || undefined,
        businessCategoryId: form.businessCategoryId,
        genderTarget: form.genderTarget,
        type: tenantType,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        addressString: form.addressString,
        ...(tenantType === "independent"
          ? {
              bufferRange: Number(form.bufferRange),
              travelRate: Number(form.travelRate),
              minTravelFee: Number(form.minTravelFee),
              idNumber: form.idNumber || undefined,
            }
          : {}),
      };

      const created = await adminService.registerTenant(payload);

      if (tenantType === "independent" && idCardFile) {
        const businessId = created?.business?._id || created?.business?.id;
        if (businessId) {
          await adminService.uploadTenantIdCard(
            businessId,
            idCardFile,
            form.idNumber || undefined,
          );
        }
      }

      setSmsRequested(false);
      setMessage("Tenant created successfully");
      setForm(emptyForm);
      setCategoryLabel("");
      setTenantType("shop");
      setIdCardFile(null);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && !err.response) {
        setMessage(
          "Cannot reach the backend API at http://localhost:5000/api/v1. Start the backend server and make sure its environment variables are loaded.",
        );
      } else {
        setMessage((err as Error).message || "Error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-normal text-teal-700">Onboard</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Add Tenant</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Create a new tenant and first owner account. Independent tenants also
          get their ID card uploaded and seeded for verification.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="w-full max-w-3xl space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-black/20"
      >
        <Field label="Tenant Type">
          <div className="grid grid-cols-2 gap-3">
            <Toggle
              active={tenantType === "shop"}
              onClick={() => setTenantType("shop")}
              title="Shop"
            />
            <Toggle
              active={tenantType === "independent"}
              onClick={() => setTenantType("independent")}
              title="Independent"
            />
          </div>
        </Field>

        <Field label="Shop Name">
          <input
            value={form.shopName}
            onChange={(e) => updateField("shopName", e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
            placeholder="Enter shop name"
          />
        </Field>

        <Field label="Business Category">
          <CategoryCombobox
            kind="business"
            allowCustom={false}
            required
            disabled={isLoadingCategories || categories.length === 0}
            value={categoryLabel}
            placeholder={
              isLoadingCategories
                ? "Loading business categories..."
                : categories.length === 0
                  ? "No business categories available"
                  : "Search business category"
            }
            onChange={(label) => {
              setCategoryLabel(label);
              const match = categories.find(
                (c) => c.name.toLowerCase() === label.trim().toLowerCase(),
              );
              updateField("businessCategoryId", match?._id || "");
            }}
          />
          {categories.length === 0 && !isLoadingCategories ? (
            <p className="mt-2 text-xs text-amber-300">
              Add categories from Admin - Categories before creating tenants.
            </p>
          ) : null}
        </Field>

        <Field label="Who do they serve?">
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["male", "Men"],
                ["female", "Women"],
                ["all", "Everyone"],
              ] as const
            ).map(([id, label]) => (
              <Toggle
                key={id}
                active={form.genderTarget === id}
                onClick={() => updateField("genderTarget", id)}
                title={label}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Audience for customers — not the owner&apos;s gender.
          </p>
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Owner Email">
            <input
              value={form.ownerEmail}
              onChange={(e) => updateField("ownerEmail", e.target.value)}
              type="email"
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
              placeholder="owner@example.com"
            />
          </Field>
          <Field label="Initial Password">
            <input
              value={form.ownerPassword}
              onChange={(e) => updateField("ownerPassword", e.target.value)}
              type="password"
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
              placeholder="Create a temporary password"
            />
          </Field>
        </div>

        <Field label="Owner Phone Number">
          <input
            value={form.ownerPhoneNumber}
            onChange={(e) => updateField("ownerPhoneNumber", e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
            placeholder="+251..."
          />
        </Field>

        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Location</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Latitude">
              <input
                value={form.latitude}
                onChange={(e) => updateField("latitude", e.target.value)}
                type="number"
                step="any"
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
                placeholder="8.9906"
              />
            </Field>
            <Field label="Longitude">
              <input
                value={form.longitude}
                onChange={(e) => updateField("longitude", e.target.value)}
                type="number"
                step="any"
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
                placeholder="38.7578"
              />
            </Field>
          </div>
          <Field label="Display Address">
            <input
              value={form.addressString}
              onChange={(e) => updateField("addressString", e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
              placeholder="Bole, Addis Ababa"
            />
          </Field>
        </div>

        {tenantType === "independent" ? (
          <div className="space-y-4 rounded-lg border border-teal-300 bg-teal-700/5 p-4">
            <p className="text-sm font-semibold text-teal-800">Independent details</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Buffer Range (km)">
                <input
                  value={form.bufferRange}
                  onChange={(e) => updateField("bufferRange", e.target.value)}
                  type="number"
                  min="0"
                  step="1"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
                />
              </Field>
              <Field label="Travel Rate (ETB/km)">
                <input
                  value={form.travelRate}
                  onChange={(e) => updateField("travelRate", e.target.value)}
                  type="number"
                  min="0"
                  step="1"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
                />
              </Field>
              <Field label="Minimum Fee (ETB)">
                <input
                  value={form.minTravelFee}
                  onChange={(e) => updateField("minTravelFee", e.target.value)}
                  type="number"
                  min="0"
                  step="1"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
                />
              </Field>
            </div>

            <Field label="ID Card Number">
              <input
                value={form.idNumber}
                onChange={(e) => updateField("idNumber", e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
                placeholder="Enter the national ID number"
              />
            </Field>

            <Field label="ID Card Photo">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
                  dragging
                    ? "border-teal-300 bg-teal-700/10"
                    : "border-slate-200 bg-white"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <p className="text-sm font-medium text-slate-800">
                  Drop the ID card image here or click to browse
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  PNG, JPG, or WebP. A clean crop works best.
                </p>
                {idCardFile ? (
                  <p className="mt-3 text-sm text-amber-300">
                    Selected: {idCardFile.name}
                  </p>
                ) : null}
              </div>
            </Field>
          </div>
        ) : null}

        <label className="flex items-center gap-3"><input type="checkbox" checked={smsRequested} onChange={event => setSmsRequested(event.target.checked)} />Business requests SMS booking alerts</label>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating..." : "Create Tenant"}
        </button>

        {message ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  title,
  active,
  onClick,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
        active
          ? "border-teal-300 bg-teal-700/15 text-teal-800"
          : "border-slate-200 bg-white text-slate-700"
      }`}
    >
      {title}
    </button>
  );
}
