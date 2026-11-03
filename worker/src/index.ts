export default {
  fetch() {
    return Response.json({ error: 'not_found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
