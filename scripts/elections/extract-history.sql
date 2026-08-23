-- Rebuild the legislation:fetch JSONL cache from the OpenStates monthly
-- pgdump: same six quoted-phrase full-text queries, same 2015 floor, same
-- per-bill shape legislation:load reads. Run inside the osdump container:
--   psql -U osint -d osdump -f /dump/extract-history.sql > openstates-history.jsonl
COPY (
  WITH matched AS (
    SELECT
      sb.bill_id,
      CASE
        WHEN sb.search_vector @@ websearch_to_tsquery('english', '"voter registration"') THEN 'voter registration'
        WHEN sb.search_vector @@ websearch_to_tsquery('english', '"election administration"') THEN 'election administration'
        WHEN sb.search_vector @@ websearch_to_tsquery('english', '"absentee ballot"') THEN 'absentee ballot'
        WHEN sb.search_vector @@ websearch_to_tsquery('english', '"mail ballot"') THEN 'mail ballot'
        WHEN sb.search_vector @@ websearch_to_tsquery('english', '"election certification"') THEN 'election certification'
        WHEN sb.search_vector @@ websearch_to_tsquery('english', '"voter roll"') THEN 'voter roll'
      END AS term
    FROM opencivicdata_searchablebill sb
  )
  SELECT jsonb_build_object(
    'id', b.id,
    'identifier', b.identifier,
    'title', b.title,
    'jurisdiction', jsonb_build_object('name', j.name),
    'session', s.identifier,
    'first_action_date', b.first_action_date,
    'latest_action_date', b.latest_action_date,
    'latest_action_description', b.latest_action_description,
    'openstates_url', 'https://openstates.org/'
      || coalesce(substring(j.id from 'state:([a-z]{2})'), 'xx')
      || '/bills/' || s.identifier || '/' || replace(b.identifier, ' ', '') || '/',
    'actions', coalesce(a.actions, '[]'::jsonb),
    'matchedQuery', m.term
  )::text
  FROM matched m
  JOIN opencivicdata_bill b ON b.id = m.bill_id
  JOIN opencivicdata_legislativesession s ON s.id = b.legislative_session_id
  JOIN opencivicdata_jurisdiction j ON j.id = s.jurisdiction_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'date', act.date,
               'description', act.description,
               'classification', to_jsonb(act.classification)
             ) ORDER BY act.date, act."order"
           ) AS actions
    FROM opencivicdata_billaction act
    WHERE act.bill_id = b.id
  ) a ON true
  WHERE m.term IS NOT NULL
    AND j.classification = 'state'
    AND nullif(b.first_action_date, '') >= '2015-01-01'
) TO STDOUT;
