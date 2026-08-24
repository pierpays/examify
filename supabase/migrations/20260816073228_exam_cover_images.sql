insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'exam-cover-images',
  'exam-cover-images',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do nothing;

create policy "Teachers can upload own exam covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exam-cover-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Teachers can update own exam covers"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'exam-cover-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Teachers can delete own exam covers"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'exam-cover-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
