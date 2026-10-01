export enum CustomerRelationshipDuration {
  JUST_MET = 'just_met',
  LESS_THAN_1_YEAR = 'less_than_1_year',
  ONE_TO_3_YEARS = '1_to_3_years',
  MORE_THAN_3_YEARS = 'more_than_3_years',
}

export enum CustomerRelationshipOrigin {
  PREVIOUS_CUSTOMER = 'previous_customer',
  AUREA_CUSTOMER_REFERRAL = 'aurea_customer_referral',
  THIRD_PARTY_REFERRAL = 'third_party_referral',
  IN_PERSON_PROSPECTING = 'in_person_prospecting',
  INBOUND_CUSTOMER = 'inbound_customer',
  SOCIAL_MEDIA_OR_WHATSAPP = 'social_media_or_whatsapp',
  CONSULTANT_RELATIVE_OR_FRIEND = 'consultant_relative_or_friend',
  OTHER = 'other',
}

export enum PartnerAssessment {
  STRONGLY_RECOMMEND = 'strongly_recommend',
  RECOMMEND = 'recommend',
  HAVE_DOUBTS = 'have_doubts',
  DO_NOT_RECOMMEND = 'do_not_recommend',
}
