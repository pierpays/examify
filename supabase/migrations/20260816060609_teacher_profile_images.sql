insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'teacher-profile-images',
  'teacher-profile-images',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do nothing;


create policy "Teachers can upload own profile images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'teacher-profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);


create policy "Teachers can update own profile images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'teacher-profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);


create policy "Teachers can delete own profile images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'teacher-profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
