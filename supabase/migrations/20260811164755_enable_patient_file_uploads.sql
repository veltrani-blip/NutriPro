update storage.buckets
set allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[],
    file_size_limit = 26214400
where id = 'patient-documents';
