insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'question-images',
  'question-images',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do nothing;

create policy "Teachers can upload question images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Teachers can update own question images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Teachers can delete own question images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'question-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
