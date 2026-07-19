import { useEffect, useRef, useState } from 'react';
import { Car, Plus, Trash2, Armchair, Fuel, Upload, CheckCircle2, AlertCircle, FileText, Camera, IdCard, ShieldCheck, ImageIcon } from 'lucide-react';
import api, { apiError } from '../api.js';
import {
  Button, Card, Input, Select, Empty, Badge, Alert, Spinner, PageTitle,
  Pagination, usePagination,
} from '../components/ui.jsx';

/* ── Document definitions ──────────────────────────────────────────────────── */
const DOCS = [
  {
    key:         'driving_license',
    field:       'drivingLicenseUrl',
    label:       'Driving Licence',
    hint:        'Clear photo of front side of your driving licence',
    Icon:        IdCard,
    accept:      'image/*',
  },
  {
    key:         'vehicle_rc',
    field:       'vehicleRcUrl',
    label:       'Vehicle RC',
    hint:        'Photo of the Registration Certificate (RC book)',
    Icon:        FileText,
    accept:      'image/*,application/pdf',
  },
  {
    key:         'proof_of_insurance',
    field:       'proofOfInsuranceUrl',
    label:       'Insurance Certificate',
    hint:        'Valid motor insurance policy certificate',
    Icon:        ShieldCheck,
    accept:      'image/*,application/pdf',
  },
  {
    key:         'vehicle_photo',
    field:       'vehiclePhotoUrl',
    label:       'Car Photo',
    hint:        'Clear photo of the vehicle (all sides visible)',
    Icon:        ImageIcon,
    accept:      'image/*',
  },
  {
    key:         'driver_selfie',
    field:       'driverSelfieUrl',
    label:       'Driver Selfie',
    hint:        'Selfie holding your driving licence (for identity)',
    Icon:        Camera,
    accept:      'image/*',
  },
];

const PER_PAGE = 6;
const emptyBasic = { vehicleModel: '', registrationNumber: '', seatingCapacity: 4, fuelType: 'PETROL' };

/* ── Helper: get file extension ───────────────────────────────────────────── */
function extOf(file) { return file.name.split('.').pop().toLowerCase() || 'jpg'; }

/* ── Single document upload zone ─────────────────────────────────────────── */
function DocZone({ doc, status, preview, onFileSelect }) {
  const inputRef = useRef(null);
  const { Icon, label, hint, accept } = doc;

  const stateClass = {
    idle:       'border-white/50 hover:border-brand/60 hover:bg-brand/5',
    uploading:  'border-amber-300/60 bg-amber-50/30',
    done:       'border-emerald-400/60 bg-emerald-50/30',
    error:      'border-rose-400/60 bg-rose-50/30',
  }[status] || 'border-white/50';

  return (
    <div
      className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-all duration-200 ${stateClass}`}
      onClick={() => status !== 'uploading' && inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onFileSelect(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files[0]; if (f) onFileSelect(f); e.target.value = ''; }}
      />

      {/* Preview / Icon */}
      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white/60 ring-1 ring-white/80 shadow-sm">
        {preview ? (
          <img src={preview} alt={label} className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-7 w-7 text-ink-400 group-hover:text-brand transition" strokeWidth={1.5} />
        )}
        {status === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-emerald-500/80">
            <CheckCircle2 className="h-6 w-6 text-white" />
          </div>
        )}
        {status === 'uploading' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-amber-400/70">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-rose-500/80">
            <AlertCircle className="h-6 w-6 text-white" />
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-bold text-ink-700">{label}</p>
        <p className="mt-0.5 text-[10px] text-ink-400 leading-snug">{hint}</p>
      </div>

      {status === 'idle' && (
        <div className="flex items-center gap-1 text-[10px] font-semibold text-ink-400 group-hover:text-brand transition">
          <Upload className="h-3 w-3" /> Click or drop
        </div>
      )}
      {status === 'uploading' && <p className="text-[10px] font-semibold text-amber-600">Uploading…</p>}
      {status === 'done'      && <p className="text-[10px] font-semibold text-emerald-600">✓ Uploaded</p>}
      {status === 'error'     && <p className="text-[10px] font-semibold text-rose-600">Upload failed — retry</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Vehicles() {
  const [vehicles, setVehicles] = useState(null);
  const [step, setStep]         = useState(1);       // 1 = basic info, 2 = documents
  const [basic, setBasic]       = useState(emptyBasic);
  const [docStatus, setDocStatus] = useState(() => Object.fromEntries(DOCS.map((d) => [d.key, 'idle'])));
  const [docUrls, setDocUrls]   = useState({});      // field -> publicUrl
  const [previews, setPreviews]  = useState({});     // key -> data URL
  const [error, setError]        = useState('');
  const [busy, setBusy]          = useState(false);

  const load = () => api.get('/vehicles').then(({ data }) => setVehicles(data.vehicles)).catch(() => setVehicles([]));
  useEffect(() => { load(); }, []);

  const setB = (k) => (e) => setBasic({ ...basic, [k]: e.target.value });

  /* ── Step 1 → 2: validate basic fields and get signed upload URLs ──────── */
  const goToDocuments = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      // Request signed upload URLs for each document type
      const fileExts = Object.fromEntries(DOCS.map((d) => [d.key, 'jpg']));
      const { data } = await api.post('/vehicles/upload-urls', { fileExts });
      // Store the signed URLs internally (keyed by doc.key)
      setDocUrls(data.urls);
      setStep(2);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  /* ── Upload a single file directly to Supabase Storage ─────────────────── */
  const uploadFile = async (doc, file) => {
    const key = doc.key;
    setDocStatus((s) => ({ ...s, [key]: 'uploading' }));

    // Local preview (images only)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews((p) => ({ ...p, [key]: ev.target.result }));
      reader.readAsDataURL(file);
    }

    try {
      const signedUrl = docUrls[key]?.signedUrl;
      if (!signedUrl) throw new Error('Missing signed URL — please go back and try again.');

      // PUT directly to Supabase Storage (no proxy through our server)
      const res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) throw new Error(`Storage returned ${res.status}`);

      setDocStatus((s) => ({ ...s, [key]: 'done' }));
    } catch (err) {
      console.error('[upload]', err);
      setDocStatus((s) => ({ ...s, [key]: 'error' }));
    }
  };

  /* ── Final submission: all docs uploaded ──────────────────────────────── */
  const submit = async () => {
    setError(''); setBusy(true);
    try {
      const allDone = DOCS.every((d) => docStatus[d.key] === 'done');
      if (!allDone) {
        throw new Error('Please upload all 5 required documents before submitting.');
      }

      // Build payload with public URLs from the signed URL response
      const payload = {
        ...basic,
        seatingCapacity: +basic.seatingCapacity,
        drivingLicenseUrl:    docUrls.driving_license?.publicUrl    || null,
        vehicleRcUrl:         docUrls.vehicle_rc?.publicUrl         || null,
        proofOfInsuranceUrl:  docUrls.proof_of_insurance?.publicUrl || null,
        vehiclePhotoUrl:      docUrls.vehicle_photo?.publicUrl      || null,
        driverSelfieUrl:      docUrls.driver_selfie?.publicUrl      || null,
      };

      await api.post('/vehicles', payload);

      // Reset everything
      setBasic(emptyBasic);
      setStep(1);
      setDocStatus(Object.fromEntries(DOCS.map((d) => [d.key, 'idle'])));
      setDocUrls({});
      setPreviews({});
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this vehicle?')) return;
    await api.delete(`/vehicles/${id}`); load();
  };

  const pager = usePagination(vehicles, PER_PAGE);
  const docsUploaded = DOCS.filter((d) => docStatus[d.key] === 'done').length;

  return (
    <div className="space-y-5">
      <PageTitle
        icon={Car}
        subtitle="Register the vehicles you drive and upload the required documents."
        actions={
          pager.total > 0 && (
            <span className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand-dark ring-1 ring-brand/20">
              {pager.total} registered
            </span>
          )
        }
      >
        My Vehicles
      </PageTitle>

      {/* ── Registration form card ─────────────────────────────────────────── */}
      <Card className="p-5">
        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-0">
          {[
            { n: 1, label: 'Vehicle Info' },
            { n: 2, label: 'Documents'   },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center">
              {i > 0 && (
                <div className={`h-px w-10 sm:w-16 transition-all ${step > 1 ? 'bg-brand' : 'bg-white/60'}`} />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${
                    step === n
                      ? 'bg-brand text-white shadow-glow'
                      : step > n
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/60 text-ink-400 ring-1 ring-white/70'
                  }`}
                >
                  {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                <span className={`text-[10px] font-semibold ${step === n ? 'text-brand-dark' : 'text-ink-400'}`}>
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Step 1: Basic vehicle info ─────────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={goToDocuments}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Model / Make" required value={basic.vehicleModel} onChange={setB('vehicleModel')} placeholder="e.g. Maruti Swift" />
              <Input label="Registration number" required value={basic.registrationNumber} onChange={setB('registrationNumber')} placeholder="KA01AB1234" />
              <Input label="Seating capacity" type="number" min="1" max="8" value={basic.seatingCapacity} onChange={setB('seatingCapacity')} />
              <Select label="Fuel type" value={basic.fuelType} onChange={setB('fuelType')}>
                {['PETROL', 'DIESEL', 'CNG', 'EV', 'HYBRID'].map((f) => <option key={f}>{f}</option>)}
              </Select>
              {error && <div className="sm:col-span-2"><Alert variant="error">{error}</Alert></div>}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Preparing…' : <><Plus className="h-4 w-4" /> Next: Upload Documents</>}
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* ── Step 2: Document uploads ───────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-700">
                Upload all 5 documents &nbsp;
                <span className={`font-bold ${docsUploaded === 5 ? 'text-emerald-600' : 'text-brand-dark'}`}>
                  ({docsUploaded}/5 done)
                </span>
              </p>
              <button
                onClick={() => { setStep(1); setError(''); }}
                className="text-xs font-semibold text-ink-400 hover:text-brand transition"
              >
                ← Back
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {DOCS.map((doc) => (
                <DocZone
                  key={doc.key}
                  doc={doc}
                  status={docStatus[doc.key]}
                  preview={previews[doc.key]}
                  onFileSelect={(file) => uploadFile(doc, file)}
                />
              ))}
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <div className="flex gap-3">
              <Button
                onClick={submit}
                disabled={busy || docsUploaded < 5}
                title={docsUploaded < 5 ? 'Upload all 5 documents first' : ''}
              >
                {busy ? 'Submitting…' : <><Car className="h-4 w-4" /> Register Vehicle</>}
              </Button>
              {docsUploaded < 5 && (
                <p className="self-center text-xs text-ink-400">
                  {5 - docsUploaded} document{5 - docsUploaded > 1 ? 's' : ''} remaining
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── Vehicle list ──────────────────────────────────────────────────── */}
      {vehicles === null ? (
        <Spinner label="Loading vehicles…" />
      ) : pager.total === 0 ? (
        <Empty icon={Car} title="No vehicles yet" hint="Add one above to start offering rides." />
      ) : (
        <div className="space-y-3">
          <Pagination {...pager} label="vehicles" />

          <div className="grid gap-3 sm:grid-cols-2">
            {pager.items.map((v) => (
              <Card key={v.vehicle_id} className="p-4" hover>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Car photo thumbnail if available */}
                    {v.vehicle_photo_url ? (
                      <img
                        src={v.vehicle_photo_url}
                        alt="vehicle"
                        className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-white/70 shadow-sm"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/15">
                        <Car className="h-5 w-5" strokeWidth={1.9} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold text-ink-800">{v.vehicle_model}</span>
                        {v.is_verified
                          ? <Badge status="COMPLETED">Verified</Badge>
                          : <Badge status="PENDING">Pending review</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-ink-500">
                        <span className="font-mono font-semibold text-ink-600">{v.registration_number}</span>
                        <span className="inline-flex items-center gap-1"><Armchair className="h-3 w-3" /> {v.seating_capacity}</span>
                        <span className="inline-flex items-center gap-1"><Fuel className="h-3 w-3" /> {v.fuel_type}</span>
                      </div>

                      {/* Document presence indicator dots */}
                      <div className="mt-1.5 flex gap-1.5">
                        {DOCS.map((doc) => {
                          const has = !!v[`${doc.key}_url`];
                          return (
                            <span
                              key={doc.key}
                              title={`${doc.label}: ${has ? 'Uploaded' : 'Missing'}`}
                              className={`h-1.5 w-1.5 rounded-full ${has ? 'bg-emerald-400' : 'bg-rose-300'}`}
                            />
                          );
                        })}
                      </div>

                      {/* Admin rejection note */}
                      {!v.is_verified && v.verification_note && (
                        <p className="mt-1.5 rounded-lg bg-rose-50/70 px-2 py-1 text-[10px] font-medium text-rose-600 ring-1 ring-rose-200/60">
                          ⚠ Admin note: {v.verification_note}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(v.vehicle_id)} title="Remove vehicle">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Pagination {...pager} label="vehicles" />
        </div>
      )}
    </div>
  );
}
